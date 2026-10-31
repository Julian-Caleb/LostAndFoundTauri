import { useEffect, useRef, useState } from 'react';

interface ImageSourcePickerProps {
  onImageSelected: (image: Blob, fileName: string) => void | Promise<void>;
}

function ImageSourcePicker({ onImageSelected }: ImageSourcePickerProps) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOpen]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const openCamera = async () => {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      setCameraError(null);
      setCameraOpen(true);
    } catch (error) {
      console.error('Could not open camera:', error);
      setCameraError('Could not access the camera. Check camera permissions and try again.');
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const handleGallerySelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      await onImageSelected(file, file.name);
      setCameraError(null);
    } catch (error) {
      console.error('Could not use selected image:', error);
      setCameraError('Could not use the selected image.');
    }
  };

  const captureImage = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('Could not capture an image from the camera.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9)
    );
    if (!image) {
      setCameraError('Could not capture an image from the camera.');
      return;
    }

    try {
      await onImageSelected(image, `item_${Date.now()}.jpg`);
      closeCamera();
      setCameraError(null);
    } catch (error) {
      console.error('Could not use captured image:', error);
      setCameraError('Could not use the captured image.');
    }
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={openCamera}
          className="rounded bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-600"
        >
          Take a picture
        </button>
        <label className="cursor-pointer rounded bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-600">
          Upload from gallery
          <input type="file" accept="image/*" className="hidden" onChange={handleGallerySelection} />
        </label>
      </div>
      {cameraError && <p className="mb-3 text-sm text-red-600">{cameraError}</p>}

      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-4 shadow-xl">
            <h2 className="mb-3 text-lg font-semibold">Take an item picture</h2>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="max-h-[65vh] w-full rounded bg-black object-contain"
              style={{ transform: 'scaleX(-1)' }}
            />
            <canvas ref={canvasRef} className="hidden" />
            {cameraError && <p className="mt-2 text-sm text-red-600">{cameraError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCamera}
                className="rounded bg-blue-700 px-4 py-2 text-white hover:bg-blue-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={captureImage}
                className="rounded bg-blue-700 px-4 py-2 text-white hover:bg-blue-600"
              >
                Capture
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ImageSourcePicker;
