// Complete src-tauri/src/main.rs file

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::State;
use std::net::{TcpListener, TcpStream};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use local_ip_address::local_ip;

#[derive(Clone, Serialize, Deserialize)]
struct ConnectionInfo {
    ip: String,
    port: u16,
}

#[derive(Clone, Serialize, Deserialize)]
struct ImageData {
    data: Vec<u8>,
    filename: String,
}

struct TcpServerState {
    listener: Arc<Mutex<Option<TcpListener>>>,
    running: Arc<Mutex<bool>>,
    pending_image: Arc<Mutex<Option<ImageData>>>,
}

impl Default for TcpServerState {
    fn default() -> Self {
        Self {
            listener: Arc::new(Mutex::new(None)),
            running: Arc::new(Mutex::new(false)),
            pending_image: Arc::new(Mutex::new(None)),
        }
    }
}

// Start TCP server, bind listener, and accept images.
#[tauri::command]
fn start_tcp_server(state: State<TcpServerState>) -> Result<ConnectionInfo, String> {
    let mut running = state.running.lock().map_err(|e| e.to_string())?;
    
    if *running {
        return Err("Server is already running".to_string());
    }

    // Get local IP address
    let local_ip = local_ip().map_err(|e| format!("Failed to get local IP: {}", e))?;
    
    // Bind to a port (try 8080, if taken, let OS assign)
    let listener = TcpListener::bind("0.0.0.0:8080")
        .or_else(|_| TcpListener::bind("0.0.0.0:0"))
        .map_err(|e| format!("Failed to bind TCP listener: {}", e))?;
    
    // Set non-blocking mode to prevent hanging
    listener.set_nonblocking(true)
        .map_err(|e| format!("Failed to set non-blocking: {}", e))?;
    
    let port = listener.local_addr()
        .map_err(|e| format!("Failed to get local address: {}", e))?
        .port();

    *state.listener.lock().map_err(|e| e.to_string())? = Some(listener);
    *running = true;

    // Start background thread to accept connections
    let pending_image = Arc::clone(&state.pending_image);
    let listener_arc = Arc::clone(&state.listener);
    let running_arc = Arc::clone(&state.running);

    thread::spawn(move || {
        loop {
            // Check if server is still running
            {
                let running = running_arc.lock().unwrap();
                if !*running {
                    break;
                }
            }

            // Try to accept connection
            let listener_guard = listener_arc.lock().unwrap();
            if let Some(listener) = listener_guard.as_ref() {
                match listener.accept() {
                    Ok((stream, addr)) => {
                        println!("Accepted connection from: {}", addr);
                        drop(listener_guard); // Release lock before handling
                        
                        // Handle the connection in the same thread
                        match handle_client(stream) {
                            Ok(image_data) => {
                                let mut pending = pending_image.lock().unwrap();
                                *pending = Some(image_data);
                                println!("Image received and stored");
                            }
                            Err(e) => {
                                eprintln!("Error handling client: {}", e);
                            }
                        }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        // No connection available, sleep briefly
                        drop(listener_guard);
                        thread::sleep(Duration::from_millis(100));
                    }
                    Err(e) => {
                        eprintln!("Error accepting connection: {}", e);
                        drop(listener_guard);
                        thread::sleep(Duration::from_millis(100));
                    }
                }
            } else {
                break;
            }
        }
        println!("TCP server thread stopped");
    });

    Ok(ConnectionInfo {
        ip: local_ip.to_string(),
        port,
    })
}

// Read image bytes from a Tcp client stream.
fn handle_client(mut stream: TcpStream) -> Result<ImageData, String> {
    // IMPORTANT: Set blocking mode for this stream
    // The listener is non-blocking, but each client connection should be blocking
    stream.set_nonblocking(false)
        .map_err(|e| format!("Failed to set blocking mode: {}", e))?;
    
    // Set read timeout to prevent hanging
    stream.set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|e| format!("Failed to set read timeout: {}", e))?;
    
    stream.set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| format!("Failed to set write timeout: {}", e))?;

    // Read the image data size
    let mut size_buf = [0u8; 4];
    stream.read_exact(&mut size_buf)
        .map_err(|e| format!("Failed to read size: {}", e))?;
    
    let image_size = u32::from_be_bytes(size_buf) as usize;
    println!("Expecting image size: {} bytes", image_size);
    
    if image_size > 10_000_000 { // 10MB limit
        return Err("Image too large (max 10MB)".to_string());
    }

    if image_size == 0 {
        return Err("Invalid image size (0 bytes)".to_string());
    }

    // Read image data with progress tracking
    let mut image_data = vec![0u8; image_size];
    stream.read_exact(&mut image_data)
        .map_err(|e| format!("Failed to read image data: {}", e))?;

    println!("Image received completely: {} bytes", image_size);

    // Send acknowledgment
    stream.write_all(b"OK")
        .map_err(|e| format!("Failed to send acknowledgment: {}", e))?;
    
    stream.flush()
        .map_err(|e| format!("Failed to flush stream: {}", e))?;

    // Give time for client to receive acknowledgment before closing
    thread::sleep(Duration::from_millis(100));

    Ok(ImageData {
        data: image_data,
        filename: format!("received_{}.jpg", chrono::Local::now().timestamp()),
    })
}

// Stop the TCP server and clear pending image state.
#[tauri::command]
fn stop_tcp_server(state: State<TcpServerState>) -> Result<(), String> {
    let mut listener = state.listener.lock().map_err(|e| e.to_string())?;
    let mut running = state.running.lock().map_err(|e| e.to_string())?;
    
    *running = false;
    *listener = None;
    
    // Clear any pending images
    let mut pending = state.pending_image.lock().map_err(|e| e.to_string())?;
    *pending = None;
    
    println!("TCP server stopped");
    
    Ok(())
}

// Return pending image data to the frontend when available.
#[tauri::command]
fn receive_image(state: State<TcpServerState>) -> Result<ImageData, String> {
    let mut pending = state.pending_image.lock().map_err(|e| e.to_string())?;
    
    if let Some(image_data) = pending.take() {
        Ok(image_data)
    } else {
        Err("No image available".to_string())
    }
}

// Check whether the TCP server is currently running.
#[tauri::command]
fn check_server_running(state: State<TcpServerState>) -> Result<bool, String> {
    let running = state.running.lock().map_err(|e| e.to_string())?;
    Ok(*running)
}

// Initialize Tauri app, plugins, and command handlers.
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .manage(TcpServerState::default())
        .invoke_handler(tauri::generate_handler![
            start_tcp_server,
            stop_tcp_server,
            receive_image,
            check_server_running
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}