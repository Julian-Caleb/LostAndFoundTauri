// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use axum::{
    extract::Multipart,
    http::StatusCode,
    response::Html,
    routing::{get, post},
    Router,
};
use std::{net::SocketAddr, path::PathBuf};
use tauri::{command, Manager};
use uuid::Uuid;

// ====== Tauri Command: get_local_ip ======
#[command]
fn get_local_ip() -> Result<String, String> {
    use std::net::TcpStream;
    if let Ok(stream) = TcpStream::connect("8.8.8.8:53") {
        if let Ok(addr) = stream.local_addr() {
            let ip = addr.ip();
            if !ip.is_loopback() && ip.is_ipv4() {
                return Ok(ip.to_string());
            }
        }
    }
    Err("Could not determine local IPv4 address".to_string())
}

// ====== Axum HTTP Handlers ======
async fn root() -> Html<&'static str> {
    Html(r#"
    <!DOCTYPE html>
    <html>
    <head>
        <title>Upload Item Photo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: sans-serif; padding: 20px; text-align: center; }
            input, button { margin: 10px 0; padding: 10px; width: 90%; max-width: 300px; }
        </style>
    </head>
    <body>
        <h2>📸 Take a Photo of the Item</h2>
        <input type="file" id="fileInput" accept="image/*" capture="environment">
        <br>
        <button onclick="upload()">Upload Photo</button>
        <p id="status"></p>
        <script>
            async function upload() {
                const fileInput = document.getElementById('fileInput');
                const file = fileInput.files[0];
                if (!file) {
                    document.getElementById('status').innerText = 'Please take a photo';
                    return;
                }

                const formData = new FormData();
                formData.append('image', file);

                try {
                    const res = await fetch('/upload', {
                        method: 'POST',
                        body: formData
                    });

                    if (res.ok) {
                        document.getElementById('status').innerText = '✅ Uploaded! You may close this window.';
                        document.getElementById('status').style.color = 'green';
                    } else {
                        document.getElementById('status').innerText = '❌ Upload failed';
                        document.getElementById('status').style.color = 'red';
                    }
                } catch (e) {
                    document.getElementById('status').innerText = '⚠️ Network error';
                }
            }
        </script>
    </body>
    </html>
    "#)
}

async fn upload(
    axum::extract::State(upload_dir): axum::extract::State<PathBuf>,
    mut multipart: Multipart,
) -> Result<Html<&'static str>, StatusCode> {
    while let Some(field) = multipart.next_field().await.map_err(|_| StatusCode::BAD_REQUEST)? {
        if field.name() == Some("image") {
            let file_name = format!("temp_{}.jpg", Uuid::new_v4());
            let data = field.bytes().await.map_err(|_| StatusCode::BAD_REQUEST)?;
            tokio::fs::write(upload_dir.join(&file_name), data)
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            return Ok(Html("Image uploaded successfully"));
        }
    }
    Err(StatusCode::BAD_REQUEST)
}

fn get_local_ip_for_log() -> Option<String> {
    use std::net::TcpStream;
    if let Ok(stream) = TcpStream::connect("8.8.8.8:53") {
        if let Ok(addr) = stream.local_addr() {
            let ip = addr.ip();
            if !ip.is_loopback() && ip.is_ipv4() {
                return Some(ip.to_string());
            }
        }
    }
    None
}

#[tokio::main]
async fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![get_local_ip]) // ← Register command
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    let app_handle = app.handle();
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .expect("failed to get app data directory")
        .join("temp_images");

    std::fs::create_dir_all(&app_data_dir).expect("failed to create temp_images dir");

    let server_app_data_dir = app_data_dir.clone();
    tauri::async_runtime::spawn(async move {
        let app = Router::new()
            .route("/", get(root))
            .route("/upload", post(upload))
            .with_state(server_app_data_dir);

        let addr: SocketAddr = ([0, 0, 0, 0], 8080).into();
        println!("📱 Phone upload server running at http://localhost:8080");

        if let Some(local_ip) = get_local_ip_for_log() {
            println!("🌐 Scan QR code pointing to: http://{}:8080", local_ip);
        }

        axum::serve(
            tokio::net::TcpListener::bind(addr).await.unwrap(),
            app,
        )
        .await
        .unwrap();
    });

    app.run(|_app_handle, _event| {});
}