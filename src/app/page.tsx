"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { 
  Wand2, 
  Image as ImageIcon, 
  Sparkles, 
  Download, 
  Loader2, 
  Trash2, 
  Scissors, 
  ExternalLink, 
  X, 
  ShieldCheck,
  Monitor,
  MoreVertical,
  Settings,
  Settings2,
  Zap,
  Upload,
  LogOut,
  ChevronDown,
  Layout,
  Lock,
  Wrench,
  Sliders,
  Undo2,
  Redo2,
  Eraser,
  Hand,
  ZoomIn,
  ZoomOut,
  Maximize,
  Shapes,
  Palette,
  Briefcase,
  AlertCircle
} from "lucide-react";
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import clsx from "clsx";
import JSZip from "jszip";
import { saveAs } from "file-saver";

const MODES = [
  { id: "standard", name: "Standard", desc: "Fast & budget-friendly", icon: ImageIcon },
  { id: "premium", name: "Premium", desc: "High fidelity details", icon: Sparkles },
  { id: "artistic", name: "Artistic", desc: "Highly stylized & unique", icon: Wand2 },
];

const STYLES = [
  "3D Render", "Vector Art", "Kawaii / Chibi", "Anime", "Vintage / Retro",
  "Isometric 3D", "Pixel Art", "Watercolor Painting", "Cyberpunk Neon",
  "Pop Art Comic", "Minimalist Line Art", "Low Poly", "Origami Papercraft",
  "Claymation / Plasticine", "Graffiti Street Art"
];

const VECTOR_STYLES = [
  { id: "minimalist", name: "✨ Minimalist 2D", prefix: "Clean minimalist vector illustration, flat design, sharp edges, 2D vector graphic, isolated" },
  { id: "isometric", name: "📐 Isometric 3D", prefix: "Premium isometric 3D vector object, stylized perspective, sharp vector lines, isolated asset" },
  { id: "mascot", name: "🐻 Mascot Sticker", prefix: "Professional mascot sticker vector, bold clean outlines, vibrant colors, isolated asset, white border" },
  { id: "kawaii", name: "🎀 Kawaii Cute", prefix: "Kawaii sticker vector, cute aesthetic, soft colors, thick rounded outlines, isolated subject, pastel palette" },
  { id: "logo", name: "💎 Logo Branding", prefix: "Professional vector logo asset, minimalist branding, geometric shapes, high-contrast, scalable, clean paths" },
  { id: "pop-art", name: "💥 Retro Pop-Art", prefix: "Pop-art vector sticker, bold comic style, vibrant saturated colors, heavy outlines, dot pattern accents" },
  { id: "line-art", name: "✒️ Pro Line-Art", prefix: "Fine line-art vector illustration, crisp black paths, professional monochrome stroke, clean curves" },
  { id: "abstract", name: "🧩 Geometric Abstract", prefix: "Abstract geometric vector art, modern generative style, crisp paths, professional composition, sharp edges" },
];

const VECTOR_PIN = process.env.NEXT_PUBLIC_VECTOR_STUDIO_PIN || "SVGVIP";


// Helper to get cropped image as data URL
async function getCroppedImg(image: HTMLImageElement, pixelCrop: PixelCrop): Promise<string> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return "";

    // Set canvas dimensions to requested pixel size
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    // v11.1: Pixel-Perfect Sampling
    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return canvas.toDataURL('image/png');
}

// v9.7: Ultimate Matte Fixed Engine (Gaussian Thresholding)
async function refineAlpha(image: HTMLImageElement, amount: number): Promise<string> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx || amount <= 0) return image.src;

  const width = image.naturalWidth;
  const height = image.naturalHeight;
  canvas.width = width;
  canvas.height = height;

  // 1. Create the Alpha Silhouette
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const mCtx = maskCanvas.getContext('2d');
  if (!mCtx) return image.src;
  
  mCtx.drawImage(image, 0, 0);
  mCtx.globalCompositeOperation = 'source-in';
  mCtx.fillStyle = 'white';
  mCtx.fillRect(0, 0, width, height);

  // 2. Blur the Silhouette (Native GPU Engine)
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = width;
  blurCanvas.height = height;
  const bCtx = blurCanvas.getContext('2d');
  if (!bCtx) return image.src;
  
  // The magic ratio: blur radius controls the softness of erosion
  bCtx.filter = `blur(${amount * 0.8}px)`;
  bCtx.drawImage(maskCanvas, 0, 0);

  // 3. Sigmoid Thresholding Pass (Anti-Aliased Erosion)
  const imageData = bCtx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // Higher threshold = more erosion. 
  // We use a soft-sigmoid to preserve anti-aliasing.
  const threshold = 160; 
  const softness = 40; 
  
  for (let i = 3; i < data.length; i += 4) {
    const alpha = data[i];
    if (alpha === 0) continue;
    
    // Smoothstep/Sigmoid mapping
    const v = (alpha - threshold) / softness;
    data[i] = Math.max(0, Math.min(255, v * 255));
  }
  bCtx.putImageData(imageData, 0, 0);

  // 4. Final Professional Composite
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(blurCanvas, 0, 0);

  return canvas.toDataURL('image/png');
}

export default function Home() {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [pinInput, setPinInput] = useState("");
  const [sessionPin, setSessionPin] = useState("");
  const [isClient, setIsClient] = useState(false);

  // Layout State
  const [activeTab, setActiveTab] = useState<"generator" | "manual" | "vector">("generator");
  const [rembgModel, setRembgModel] = useState<'standard' | 'smart'>('standard');
  const [isVectorWarningOpen, setIsVectorWarningOpen] = useState(false);
  const [vectorPinInput, setVectorPinInput] = useState("");
  const [isVectorAuthenticated, setIsVectorAuthenticated] = useState(false);
  
  // Vector Mode State (v12.0)
  const [vectorPrompt, setVectorPrompt] = useState("");
  const [vectorStyle, setVectorStyle] = useState(VECTOR_STYLES[0]);
  const [vectorBatchSize, setVectorBatchSize] = useState(1);
  const [isVectorPro, setIsVectorPro] = useState(false);
  const [isVectorGenerating, setIsVectorGenerating] = useState(false);
  const [vectorImages, setVectorImages] = useState<{id: string, url: string, timestamp: number, isPro: boolean}[]>([]);
  const [isProSwitchModalOpen, setIsProSwitchModalOpen] = useState(false);

  // Upscale Rate Limiting State
  const [globalUpscaleState, setGlobalUpscaleState] = useState<"IDLE" | "PROCESSING" | "COOLDOWN">("IDLE");
  const [upscaleCooldownTime, setUpscaleCooldownTime] = useState(0);

  // Generator State
  const [prompt, setPrompt] = useState("");
  const [batchSize, setBatchSize] = useState(1);
  const [mode, setMode] = useState("premium");
  const [artStyle, setArtStyle] = useState("3D Render");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<{url: string, isUpscaling?: boolean, upscaledUrl?: string}[]>([]);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");

  // Manual Mode State (BATCH ENABLED)
  const [manualImages, setManualImages] = useState<{
    id: string, 
    originalUrl: string, 
    url: string, 
    isProcessing: boolean, 
    isUpscaling: boolean, 
    upscaledUrl?: string,
    isBackgroundRemoved?: boolean
  }[]>([]);
  const [isManualBatchProcessing, setIsManualBatchProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isStyleOpen, setIsStyleOpen] = useState(false);
  const styleDropdownRef = useRef<HTMLDivElement>(null);

  // Studio State (v11.1)
  const [studioTarget, setStudioTarget] = useState<{idx: number, tab: 'gen'|'manual'} | null>(null);
  const [refineAmount, setRefineAmount] = useState(2);
  const [isRefining, setIsRefining] = useState(false);
  const [refinedPreviewUrl, setRefinedPreviewUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [cropAspect, setCropAspect] = useState<number | undefined>(undefined);
  const [isCropping, setIsCropping] = useState(false);
  const [showCropControls, setShowCropControls] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);

  // v11.0: Universal Studio & Cleanup Suite
  const [studioMode, setStudioMode] = useState<'CROP' | 'REFINE' | 'CLEANUP'>('CROP');
  const [brushSize, setBrushSize] = useState(25);
  const [wandTolerance, setWandTolerance] = useState(30);
  const [isCleaning, setIsCleaning] = useState(false);
  const cleanupCanvasRef = useRef<HTMLCanvasElement>(null);
  const [cleanupHistory, setCleanupHistory] = useState<string[]>([]);
  const [cleanupRedoStack, setCleanupRedoStack] = useState<string[]>([]);
  const [showStudioControls, setShowStudioControls] = useState(false);
  const [cleanupTool, setCleanupTool] = useState<'WAND' | 'ERASER'>('WAND');
  const [brushCirclePos, setBrushCirclePos] = useState<{ x: number, y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanMode, setIsPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // v11.1.68: Pure Studio Session Meta-State
  const stableStudioUrl = useMemo(() => {
    if (!studioTarget) return "";
    const target = (studioTarget.tab === 'gen' ? generatedImages : manualImages)[studioTarget.idx];
    if (!target) return "";
    const url = target.url;
    // Data URLs/Blobs are always CORS-safe, no timestamp needed
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    // Append a stable timestamp for the current sticker to break CORS cache per session
    return `${url}?t=studio-${studioTarget.tab}-${studioTarget.idx}`;
  }, [studioTarget, generatedImages, manualImages]);

  useEffect(() => {
    setIsClient(true);
    const savedPin = localStorage.getItem("admin_pin");
    if (savedPin) {
       setSessionPin(savedPin);
       setIsAuthenticated(true);
    } else {
       setIsAuthenticated(false);
    }

    // Load AI Generator History
    const savedGen = localStorage.getItem("sticker_gen_v1");
    if (savedGen) {
      try { setGeneratedImages(JSON.parse(savedGen)); } catch(e) { console.error(e); }
    }

    // Load Manual Tool History
    const savedManual = localStorage.getItem("sticker_manual_v1");
    if (savedManual) {
      try { setManualImages(JSON.parse(savedManual)); } catch(e) { console.error(e); }
    }

    // Load Vector Studio History
    const savedVector = localStorage.getItem("sticker_vector_v1");
    if (savedVector) {
      try { setVectorImages(JSON.parse(savedVector)); } catch(e) { console.error(e); }
    }
  }, []);

  // Sync History for all tabs
  useEffect(() => {
    if (isClient) {
      localStorage.setItem("sticker_gen_v1", JSON.stringify(generatedImages));
    }
  }, [generatedImages, isClient]);

  useEffect(() => {
    if (isClient) {
      localStorage.setItem("sticker_manual_v1", JSON.stringify(manualImages));
    }
  }, [manualImages, isClient]);

  useEffect(() => {
    if (isClient) {
      localStorage.setItem("sticker_vector_v1", JSON.stringify(vectorImages));
    }
  }, [vectorImages, isClient]);

  // Close style dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (styleDropdownRef.current && !styleDropdownRef.current.contains(e.target as Node)) {
        setIsStyleOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Workspace Keyboard & Zoom Controllers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (studioMode !== 'CLEANUP') return;
      
      const isZ = e.key.toLowerCase() === 'z';
      const isY = e.key.toLowerCase() === 'y';
      const isCtrl = e.ctrlKey || e.metaKey;

      if (e.code === 'Space') {
          setIsSpacePressed(true);
          e.preventDefault();
      }

      if (isCtrl && isZ) {
        if (e.shiftKey) handleRedo();
        else handleUndo();
        e.preventDefault();
      } else if (isCtrl && isY) {
        handleRedo();
        e.preventDefault();
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePressed(false);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [studioMode, cleanupHistory, cleanupRedoStack]);

  const handleWheel = (e: React.WheelEvent) => {
    if (studioMode !== 'CLEANUP') return;
    e.preventDefault();
    
    if (e.altKey && cleanupTool === 'ERASER') {
      // Alt + Scroll = Adjust Brush Size
      const step = e.deltaY > 0 ? -2 : 2;
      setBrushSize(prev => Math.min(Math.max(1, prev + step), 100));
    } else {
      // Direct Scroll = Zoom (Industry Standard)
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(prev => Math.min(Math.max(0.5, prev * delta), 10));
    }
  };

  // Responsive Hook for CropModal
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const checkMobile = () => setIsMobile(window.innerWidth < 768);
      checkMobile();
      window.addEventListener("resize", checkMobile);
      return () => window.removeEventListener("resize", checkMobile);
    }
  }, []);

  // Real-time Refine Preview Engine (v9.0)
  useEffect(() => {
    if (studioTarget === null || studioMode !== 'REFINE') {
      setRefinedPreviewUrl(null);
      return;
    }
    
    setIsRefining(true);
    const timeout = setTimeout(async () => {
      try {
        if (!stableStudioUrl) return;
        
        // v11.1.75: Always refine from ORIGINAL to avoid cumulative processing
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = async () => {
          const preview = await refineAlpha(img, refineAmount);
          setRefinedPreviewUrl(preview);
          setIsRefining(false);
        };
        img.src = stableStudioUrl;
      } catch (err) {
        console.error("Preview Refine Error:", err);
        setIsRefining(false);
      }
    }, 200); // 200ms debounce

    return () => clearTimeout(timeout);
  }, [studioTarget, studioMode, refineAmount, stableStudioUrl]);

  // Cleanup Canvas Synchronization (v11.1)
  useEffect(() => {
    if (studioMode !== 'CLEANUP' || !studioTarget) return;

    const timeout = setTimeout(() => {
      const canvas = cleanupCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const target = (studioTarget.tab === 'gen' ? generatedImages : manualImages)[studioTarget.idx];
      const img = new Image();
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Reset
        ctx.drawImage(img, 0, 0);
      };
      img.crossOrigin = "anonymous";
      img.src = refinedPreviewUrl || stableStudioUrl || "";
    }, 50);

    return () => clearTimeout(timeout);
  }, [studioMode, studioTarget, refinedPreviewUrl, generatedImages, manualImages]);

  const [isVerifying, setIsVerifying] = useState(false);
  const [authError, setAuthError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) return;
    setIsVerifying(true);
    setAuthError("");
    try {
        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-pin': pinInput },
            body: JSON.stringify({ action: 'verify_pin' })
        });
        if (!res.ok) {
            setAuthError("PIN Salah!");
            setIsVerifying(false);
            return;
        }
        localStorage.setItem("admin_pin", pinInput);
        setSessionPin(pinInput);
        setIsAuthenticated(true);
    } catch (err) {
        setAuthError("Gagal verifikasi.");
    }
    setIsVerifying(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_pin");
    setSessionPin("");
    setIsAuthenticated(false);
  };

  const API_HEADERS = { 'Content-Type': 'application/json', 'x-admin-pin': sessionPin };

  // Helper Cooldown
  const triggerCooldown = (duration = 10) => {
    setGlobalUpscaleState("COOLDOWN");
    let timeLeft = duration;
    setUpscaleCooldownTime(timeLeft);
    const timer = setInterval(() => {
       timeLeft -= 1;
       setUpscaleCooldownTime(timeLeft);
       if (timeLeft <= 0) {
           clearInterval(timer);
           setGlobalUpscaleState("IDLE");
           setProgressText("");
       }
    }, 1000);
  };

  // --- GENERATOR LOGIC ---
  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    // v11.1: Accumulative results - no more gallery clearing
    setProgress(0);
    try {
      const results: any[] = [];
      for (let i = 0; i < batchSize; i++) {
        setProgressText(`Mencetak [${i + 1}/${batchSize}]...`);
        const genRes = await fetch('/api/generate', {
          method: 'POST',
          headers: API_HEADERS,
          body: JSON.stringify({ action: "generate_image", prompt, mode, artStyle }),
        });
        const genData = await genRes.json();
        if (!genRes.ok) throw new Error(genData.error);

        setProgressText(`Mendinginkan API (10s)...`);
        await new Promise(r => setTimeout(r, 10000));

        setProgressText(`Hapus BG [${i + 1}/${batchSize}]...`);
        const bgRes = await fetch('/api/generate', {
          method: 'POST',
          headers: API_HEADERS,
          body: JSON.stringify({ 
            action: "remove_bg", 
            imageUrl: genData.imageUrl,
            rembgModel: rembgModel
          }),
        });
        const bgData = await bgRes.json();
        if (!bgRes.ok) throw new Error(bgData.error);

        const newSticker = { url: bgData.imageUrl };
        setGeneratedImages(prev => [...prev, newSticker]); 
        setProgress(((i + 1) / batchSize) * 100);
        if (i < batchSize - 1) await new Promise(r => setTimeout(r, 10000));
      }
      triggerCooldown();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateVector = async () => {
    if (!vectorPrompt.trim() || isVectorGenerating) return;
    setIsVectorGenerating(true);
    setProgress(0);
    setProgressText("Initializing Vector Engine...");

    try {
      const results: {id: string, url: string, timestamp: number, isPro: boolean}[] = [];
      for (let i = 0; i < vectorBatchSize; i++) {
        setProgress(Math.round(((i) / vectorBatchSize) * 100));
        setProgressText(`Generating Vector ${i + 1} of ${vectorBatchSize}...`);
        
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-PIN': sessionPin },
          body: JSON.stringify({ 
            action: "generate_vector", 
            prompt: vectorPrompt,
            stylePrefix: vectorStyle.prefix,
            isPro: isVectorPro
          }),
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Generation failed");
        
        results.push({
          id: Math.random().toString(36).substr(2, 9),
          url: data.imageUrl,
          timestamp: Date.now(),
          isPro: isVectorPro
        });

        if (i < vectorBatchSize - 1) await new Promise(r => setTimeout(r, 1000));
      }
      
      setVectorImages(prev => [...results, ...prev]);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsVectorGenerating(false);
      setProgress(100);
      setProgressText("");
    }
  };

  const handleDeleteVector = (id: string) => {
    setVectorImages(prev => prev.filter(img => img.id !== id));
  };

  const handleClearAllVector = () => {
    if (confirm("Hapus semua riwayat Vector Studio?")) {
      setVectorImages([]);
    }
  };

  const handleDeleteAI = (index: number) => {
    setGeneratedImages(prev => prev.filter((_, i) => i !== index));
    if (studioTarget?.tab === 'gen' && studioTarget.idx === index) {
      setStudioTarget(null);
      setShowStudioControls(false);
    }
  };

  const handleUpscale = async (index: number) => {
    if (globalUpscaleState !== "IDLE" || isGenerating) return;
    const target = generatedImages[index];
    if (!target || target.isUpscaling || target.upscaledUrl) return;

    setGlobalUpscaleState("PROCESSING");
    const newData = [...generatedImages];
    newData[index].isUpscaling = true;
    setGeneratedImages(newData);

    try {
       const res = await fetch('/api/generate', {
         method: 'POST',
         headers: API_HEADERS,
         body: JSON.stringify({ action: "upscale", imageUrl: target.url }),
       });
       const data = await res.json();
       if (!res.ok) throw new Error(data.error);
       newData[index].upscaledUrl = data.imageUrl;
    } catch(err: any) {
       alert(err.message);
    } finally {
       newData[index].isUpscaling = false;
       setGeneratedImages([...newData]);
       triggerCooldown();
    }
  };

  // --- MANUAL BATCH LOGIC ---
  const processFile = (file: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1024; // Guaranteed safe limit for all Replicate GPU models
        let w = img.width, h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w > h) { h = (h/w)*MAX_DIM; w = MAX_DIM; }
          else { w = (w/h)*MAX_DIM; h = MAX_DIM; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/png");
        
        setManualImages(prev => [
          ...prev, 
          { id: Math.random().toString(36).substr(2, 9), originalUrl: dataUrl, url: dataUrl, isProcessing: false, isUpscaling: false, isBackgroundRemoved: false }
        ]);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(processFile);
      e.target.value = ""; // Reset value to allow identical re-uploads
    }
  };

  const handleSaveCrop = async () => {
    if (!studioTarget || (!completedCrop && !crop)) return;
    const { idx, tab } = studioTarget;
    setIsCropping(true);
    try {
      const target = (tab === 'gen' ? generatedImages : manualImages)[idx];
      const image = imgRef.current;
      
      if (!image) throw new Error("Image reference not found");

      // Calculate Scaling Factor (Natural vs Displayed)
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      // Ensure we use precise pixel coordinates
      const finalPixelCrop = completedCrop || {
        x: (crop?.x || 0) * (image.width / 100),
        y: (crop?.y || 0) * (image.height / 100),
        width: (crop?.width || 100) * (image.width / 100),
        height: (crop?.height || 100) * (image.height / 100)
      };

      const scaledPixelCrop: PixelCrop = {
        unit: 'px',
        x: finalPixelCrop.x * scaleX,
        y: finalPixelCrop.y * scaleY,
        width: finalPixelCrop.width * scaleX,
        height: finalPixelCrop.height * scaleY
      };

      const croppedImage = await getCroppedImg(
        image, 
        scaledPixelCrop
      );
      
      if (tab === 'gen') {
        setGeneratedImages(prev => {
          const newImages = [...prev];
          if (!newImages[idx]) return prev;
          newImages[idx] = {
            ...newImages[idx],
            url: croppedImage,
            upscaledUrl: undefined
          };
          return newImages;
        });
      } else {
        setManualImages(prev => {
          const newImages = [...prev];
          if (!newImages[idx]) return prev;
          newImages[idx] = {
            ...newImages[idx],
            id: Math.random().toString(36).substr(2, 9), 
            url: croppedImage,
            originalUrl: croppedImage,
            upscaledUrl: undefined,
            isBackgroundRemoved: newImages[idx].isBackgroundRemoved
          };
          return newImages;
        });
      }
      setStudioTarget(null);
      setShowStudioControls(false);
    } catch (e) {
      console.error(e);
      alert("Gagal memotong gambar.");
    } finally {
      setIsCropping(false);
    }
  };

  const handleSaveRefine = async () => {
    if (!studioTarget) return;
    const { idx, tab } = studioTarget;
    setIsRefining(true);
    try {
      // v11.1.75: Always process from original source for absolute accuracy
      const img = new Image();
      img.crossOrigin = "anonymous";
      const resultUrl = await new Promise<string>((resolve, reject) => {
        img.onload = async () => {
          try {
            const res = await refineAlpha(img, refineAmount);
            resolve(res);
          } catch (e) { reject(e); }
        };
        img.onerror = reject;
        img.src = stableStudioUrl;
      });
      
      if (tab === 'gen') {
        setGeneratedImages(prev => {
          const newImages = [...prev];
          if (!newImages[idx]) return prev;
          newImages[idx] = { 
            ...newImages[idx], 
            url: resultUrl, 
            upscaledUrl: undefined 
          };
          return newImages;
        });
      } else {
        setManualImages(prev => {
          const newImages = [...prev];
          if (!newImages[idx]) return prev;
          newImages[idx] = { 
            ...newImages[idx], 
            id: Math.random().toString(36).substr(2, 9), 
            url: resultUrl, 
            originalUrl: resultUrl, 
            upscaledUrl: undefined,
            isBackgroundRemoved: newImages[idx].isBackgroundRemoved
          };
          return newImages;
        });
      }
      setStudioTarget(null);
      setShowStudioControls(false);
      setRefinedPreviewUrl(null);
    } catch (e) {
      console.error(e);
      alert("Gagal mengkikis gambar.");
    } finally {
      setIsRefining(false);
    }
  };

  // v11.1.11: Coordinate Helper for touch/mouse unity
  const getEventCoords = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = cleanupCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    // Support both mouse and touch, accounting for React synthetic events vs native
    const clientX = (e as any).touches ? (e as any).touches[0].clientX : (e as any).clientX;
    const clientY = (e as any).touches ? (e as any).touches[0].clientY : (e as any).clientY;
    
    // Position relative to canvas display element
    const displayX = clientX - rect.left;
    const displayY = clientY - rect.top;

    // Convert display position to natural canvas coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: Math.floor(displayX * scaleX),
      y: Math.floor(displayY * scaleY)
    };
  };

  const handleMagicWand = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = cleanupCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const { x, y } = getEventCoords(e);
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imgData.data;
    const startIdx = (y * canvas.width + x) * 4;
    const startR = pixels[startIdx];
    const startG = pixels[startIdx + 1];
    const startB = pixels[startIdx + 2];
    const startA = pixels[startIdx + 3];

    if (startA < 10) return; // Ignore transparent

    saveCleanupState();
    setIsCleaning(true);
    const stack = [[x, y]];
    const visited = new Uint8Array(canvas.width * canvas.height);

    while (stack.length > 0) {
      const [currX, currY] = stack.pop()!;
      const idx = (currY * canvas.width + currX) * 4;

      if (visited[currY * canvas.width + currX]) continue;
      visited[currY * canvas.width + currX] = 1;

      const diff = Math.sqrt(
        Math.pow(pixels[idx] - startR, 2) +
        Math.pow(pixels[idx + 1] - startG, 2) +
        Math.pow(pixels[idx + 2] - startB, 2)
      );

      if (diff <= wandTolerance) {
        pixels[idx + 3] = 0;
        if (currX > 0) stack.push([currX - 1, currY]);
        if (currX < canvas.width - 1) stack.push([currX + 1, currY]);
        if (currY > 0) stack.push([currX, currY - 1]);
        if (currY < canvas.height - 1) stack.push([currX, currY + 1]);
      }
    }

    ctx.putImageData(imgData, 0, 0);
    setRefinedPreviewUrl(canvas.toDataURL());
    setIsCleaning(false);
  };

  const handleEraserMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const isTouch = 'touches' in e.nativeEvent;
    if (!isTouch && (e as React.MouseEvent).buttons !== 1) return;
    
    const canvas = cleanupCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getEventCoords(e);

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const finalizeCleanup = () => {
    const canvas = cleanupCanvasRef.current;
    if (canvas) setRefinedPreviewUrl(canvas.toDataURL());
  };

  const saveCleanupState = () => {
    const canvas = cleanupCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL();
    setCleanupHistory(prev => [...prev.slice(-19), dataUrl]);
    setCleanupRedoStack([]); // Clear redo on action
  };

  const handleUndo = () => {
    if (cleanupHistory.length === 0) return;
    const canvas = cleanupCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentState = canvas.toDataURL();
    const prevState = cleanupHistory[cleanupHistory.length - 1];
    
    setCleanupRedoStack(prev => [...prev, currentState]);
    setCleanupHistory(prev => prev.slice(0, -1));

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setRefinedPreviewUrl(canvas.toDataURL());
    };
    img.src = prevState;
  };

  const handleRedo = () => {
    if (cleanupRedoStack.length === 0) return;
    const canvas = cleanupCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentState = canvas.toDataURL();
    const nextState = cleanupRedoStack[cleanupRedoStack.length - 1];

    setCleanupHistory(prev => [...prev, currentState]);
    setCleanupRedoStack(prev => prev.slice(0, -1));

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setRefinedPreviewUrl(canvas.toDataURL());
    };
    img.src = nextState;
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height, naturalWidth, naturalHeight } = e.currentTarget;
    const imageAspect = width / height;
    
    // Always provide an initial crop (Maximized)
    let initialCrop: Crop;
    if (cropAspect) {
      const isImageWiderThanAspect = imageAspect > cropAspect;
      initialCrop = centerCrop(
        makeAspectCrop(
          { unit: '%', [isImageWiderThanAspect ? 'height' : 'width']: 100 }, 
          cropAspect, 
          width, 
          height
        ),
        width,
        height
      );
    } else {
      initialCrop = { unit: '%' as const, x: 0, y: 0, width: 100, height: 100 };
    }
    
    setCrop(initialCrop);

    // Also calculate initial PixelCrop so Simpan button is active immediately
    const pixelCrop: PixelCrop = {
      unit: 'px',
      x: (initialCrop.x * naturalWidth) / 100,
      y: (initialCrop.y * naturalHeight) / 100,
      width: (initialCrop.width * naturalWidth) / 100,
      height: (initialCrop.height * naturalHeight) / 100
    };
    setCompletedCrop(pixelCrop);
  };

  const handleManualAction = async (idx: number, type: "remove_bg" | "upscale") => {
    if (isManualBatchProcessing || globalUpscaleState !== "IDLE" || isGenerating) return;
    
    const target = manualImages[idx];
    const newImages = [...manualImages];

    if (type === "remove_bg") newImages[idx].isProcessing = true;
    else newImages[idx].isUpscaling = true;
    setManualImages([...newImages]);

    try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: API_HEADERS,
          body: JSON.stringify({ 
            action: type, 
            imageUrl: type === "upscale" ? (target.upscaledUrl || target.url) : target.url,
            rembgModel: type === "remove_bg" ? rembgModel : undefined
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        if (type === "remove_bg") {
          newImages[idx].url = data.imageUrl;
          newImages[idx].isBackgroundRemoved = true;
        }
        else newImages[idx].upscaledUrl = data.imageUrl;
        
        triggerCooldown();
    } catch (err: any) {
        alert(err.message);
    } finally {
        newImages[idx].isProcessing = false;
        newImages[idx].isUpscaling = false;
        setManualImages([...newImages]);
    }
  };

  const handleBatchManual = async (type: "remove_bg" | "upscale") => {
    if (isManualBatchProcessing || globalUpscaleState !== "IDLE" || isGenerating) return;
    setIsManualBatchProcessing(true);
    setProgressText(`Memulai Batch Manual: ${type === "remove_bg" ? "Hapus BG" : "Upscale 4K"}...`);
    
    try {
        const itemsToProcess = manualImages.filter(img => 
          type === "remove_bg" ? img.url === img.originalUrl : !img.upscaledUrl
        );
        
        if (itemsToProcess.length === 0) {
            alert(`Semua gambar sudah di-${type === "remove_bg" ? "rembg" : "upscale"}!`);
            setIsManualBatchProcessing(false);
            return;
        }

        for (let i = 0; i < manualImages.length; i++) {
           const img = manualImages[i];
           
           if (type === "remove_bg" && img.url === img.originalUrl) {
              setProgressText(`Rembg [${i+1}/${manualImages.length}]...`);
              const res = await fetch('/api/generate', {
                method: 'POST',
                headers: API_HEADERS,
                body: JSON.stringify({ 
                  action: "remove_bg", 
                  imageUrl: img.originalUrl,
                  rembgModel: rembgModel
                }),
              });
              const data = await res.json();
              if (res.ok) {
                setManualImages(prev => {
                  const updated = [...prev];
                  updated[i].url = data.imageUrl;
                  updated[i].isBackgroundRemoved = true;
                  return updated;
                });
                if (i < manualImages.length - 1) await new Promise(r => setTimeout(r, 10000));
              }
           }

           if (type === "upscale" && !img.upscaledUrl) {
              setProgressText(`Upscale [${i+1}/${manualImages.length}]...`);
              const res = await fetch('/api/generate', {
                method: 'POST',
                headers: API_HEADERS,
                body: JSON.stringify({ action: "upscale", imageUrl: img.url }),
              });
              const data = await res.json();
              if (res.ok) {
                 setManualImages(prev => {
                   const updated = [...prev];
                   updated[i].upscaledUrl = data.imageUrl;
                   return updated;
                 });
                 if (i < manualImages.length - 1) await new Promise(r => setTimeout(r, 10000));
              }
           }
        }
        triggerCooldown();
    } catch (err: any) {
        alert(err.message);
    } finally {
        setIsManualBatchProcessing(false);
    }
  };

  const handleDownloadZip = async (source: "gen" | "manual") => {
    const images = source === "gen" ? generatedImages : manualImages.map(m => ({ url: m.url, upscaledUrl: m.upscaledUrl }));
    if (images.length === 0) return;
    const zip = new JSZip();
    const folder = zip.folder("stickers");
    if (!folder) return;
    try {
        await Promise.all(images.map(async (item, idx) => {
            const res = await fetch(item.upscaledUrl || item.url);
            const blob = await res.blob();
            folder.file(`sticker_${idx+1}${item.upscaledUrl ? '_4k' : ''}.png`, blob);
        }));
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, `stickers_${source}.zip`);
    } catch (e) { alert("ZIP error"); }
  };

  if (!isClient) return null;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-6 bg-zinc-950">
        <div className="w-full max-w-md glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-pink-500/10 opacity-50 pointer-events-none group-hover:opacity-75 transition-opacity" />
          <div className="relative z-10">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <ShieldCheck className="w-8 h-8 text-white" />
              </div>
            </div>
            
            <h1 className="text-2xl font-bold text-center text-white mb-2">Production Login</h1>
            <p className="text-zinc-500 text-sm text-center mb-8">Access restricted to authorized production staff only.</p>
            
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold ml-1">Admin Access PIN</label>
                <input 
                  type="password" 
                  value={pinInput} 
                  onChange={(e) => setPinInput(e.target.value)} 
                  placeholder="••••••" 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-center text-2xl tracking-[0.5em] text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-mono"
                  autoFocus
                />
              </div>
              
              {authError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs text-center animate-shake">
                  {authError}
                </div>
              )}
              
              <button 
                type="submit" 
                disabled={isVerifying || !pinInput.trim()} 
                className="w-full py-4 bg-indigo-500 hover:bg-indigo-400 disabled:bg-zinc-800 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
              >
                {isVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isVerifying ? "Verifying..." : "Unlock Dashboard"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center p-6 md:p-12 w-full max-w-6xl mx-auto">
      
      <div className="absolute top-4 right-4 z-20"><button onClick={handleLogout} className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-full text-sm font-semibold flex items-center gap-2"><LogOut className="w-4 h-4" /> Logout</button></div>

      <div className="text-center mb-8 mt-8">
        <h1 className="text-4xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">StickerMaker AI</h1>
        {/* Header Switchers Container */}
        <div className={clsx(
          "flex flex-row items-center justify-center gap-2 md:gap-3 mt-8 scale-[0.85] md:scale-100 transition-all origin-center",
          (isGenerating || isManualBatchProcessing || globalUpscaleState !== 'IDLE') && "opacity-50 pointer-events-none"
        )}>
          {/* Main Tab Switcher */}
          <div className="inline-flex bg-white/5 border border-white/10 p-0.5 md:p-1 rounded-2xl backdrop-blur-md">
             <button 
               onClick={() => { setActiveTab("generator"); setStudioTarget(null); setPreviewImage(null); }} 
               disabled={isGenerating || isManualBatchProcessing || isVectorGenerating || globalUpscaleState !== 'IDLE'}
               className={clsx("px-4 md:px-6 py-2 md:py-2.5 rounded-xl text-[11px] md:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed", activeTab === "generator" ? "bg-indigo-500 text-white shadow-lg" : "text-zinc-500")}
             > 
               <Zap className="w-3.5 h-3.5 md:w-4 h-4" /> 
               <span className="md:hidden">AI</span>
               <span className="hidden md:inline">AI Generator</span>
             </button>
             <button 
               onClick={() => { setActiveTab("manual"); setStudioTarget(null); setPreviewImage(null); }} 
               disabled={isGenerating || isManualBatchProcessing || isVectorGenerating || globalUpscaleState !== 'IDLE'}
               className={clsx("px-4 md:px-6 py-2 md:py-2.5 rounded-xl text-[11px] md:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed", activeTab === "manual" ? "bg-pink-500 text-white shadow-lg" : "text-zinc-500")}
             > 
               <Upload className="w-3.5 h-3.5 md:w-4 h-4" /> 
               <span className="md:hidden">Tool</span>
               <span className="hidden md:inline">Manual Tool</span>
             </button>
             <button 
               onClick={() => { setActiveTab("vector"); setStudioTarget(null); setPreviewImage(null); setIsVectorWarningOpen(true); }} 
               disabled={isGenerating || isManualBatchProcessing || isVectorGenerating || globalUpscaleState !== 'IDLE'}
               className={clsx("px-4 md:px-6 py-2 md:py-2.5 rounded-xl text-[11px] md:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed", activeTab === "vector" ? "bg-emerald-500 text-white shadow-lg" : "text-zinc-500")}
             > 
               <Shapes className="w-3.5 h-3.5 md:w-4 h-4" /> 
               <span className="md:hidden">Vector</span>
               <span className="hidden md:inline">Vector Studio</span>
             </button>
          </div>

          <div className="w-px h-5 md:h-6 bg-white/10 mx-0.5" />

          {/* Global Background Removal Mode Switcher (Compact Icon Toggle) */}
          <div className="flex p-0.5 md:p-1 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md">
            <div className="flex bg-black/40 rounded-xl p-0.5">
              <button
                onClick={() => setRembgModel('standard')}
                disabled={isGenerating || isManualBatchProcessing || isVectorGenerating || globalUpscaleState !== 'IDLE'}
                title="Standard Mode (Rapi)"
                className={clsx(
                  "p-2 md:p-2.5 rounded-lg transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed",
                  rembgModel === 'standard' ? "bg-indigo-500 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-400"
                )}
              >
                <ShieldCheck className="w-3.5 h-3.5 md:w-4 h-4" />
              </button>
              <button
                onClick={() => setRembgModel('smart')}
                disabled={isGenerating || isManualBatchProcessing || isVectorGenerating || globalUpscaleState !== 'IDLE'}
                title="Smart Mode (Detail)"
                className={clsx(
                  "p-2 md:p-2.5 rounded-lg transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed",
                  rembgModel === 'smart' ? "bg-pink-500 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-400"
                )}
              >
                <Zap className="w-3.5 h-3.5 md:w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
        {/* Left Column */}
        <div className="lg:col-span-4 space-y-6">
          {activeTab === "generator" ? (
            <div className="glass-panel p-6 rounded-2xl">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2"> <Wand2 className="w-5 h-5 text-indigo-400" /> Settings </h2>
              <div className="space-y-5">
                {/* Subject Input */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold ml-1">Subject / Prompt</label>
                  <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe your sticker..." className="w-full glass-input rounded-xl p-4 min-h-[100px] resize-none text-sm" />
                </div>

                {/* Custom Art Style Dropdown */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold ml-1">Art Style</label>
                  <div className="relative" ref={styleDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsStyleOpen(!isStyleOpen)}
                      className="w-full glass-input rounded-xl p-3.5 flex items-center justify-between text-sm text-white hover:bg-white/5 transition-colors"
                    >
                      <span>{artStyle}</span>
                      <ChevronDown className={clsx("w-4 h-4 text-zinc-500 transition-transform", isStyleOpen && "rotate-180")} />
                    </button>
                    {isStyleOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-zinc-900 rounded-xl border border-white/10 shadow-2xl shadow-black/50 max-h-[280px] overflow-y-auto">
                        {STYLES.map(s => (
                          <button
                            key={s}
                            onClick={() => { setArtStyle(s); setIsStyleOpen(false); }}
                            className={clsx(
                              "w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-2",
                              artStyle === s ? "bg-indigo-500/20 text-indigo-400 font-bold" : "text-zinc-300 hover:bg-white/5"
                            )}
                          >
                            {artStyle === s && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Batch Size */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Batch Size</span><span className="text-indigo-400 font-bold">{batchSize}</span></div>
                  <input type="range" min="1" max="20" value={batchSize} onChange={(e) => setBatchSize(parseInt(e.target.value))} className="w-full" />
                </div>

                {/* AI Model Selection */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold ml-1">AI Model</label>
                  <div className="space-y-2"> {MODES.map(m => <button key={m.id} onClick={() => setMode(m.id)} className={clsx("w-full p-3 rounded-xl border flex items-center gap-3 transition-colors", mode === m.id ? "border-pink-500 bg-pink-500/10" : "border-white/10 hover:bg-white/5")}> <m.icon className="w-5 h-5 text-indigo-400" /> <div className="text-left"><div className="text-sm font-bold">{m.name}</div><div className="text-[10px] text-zinc-500 leading-tight">{m.desc}</div></div> </button>)} </div>
                </div>

                 <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()} className="w-full py-4 rounded-xl bg-indigo-500 text-white font-bold disabled:opacity-50"> {isGenerating ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Generate Batch"} </button>
              </div>
            </div>
          ) : activeTab === "vector" ? (
             <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
               <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-cyan-500" />
               <h2 className="text-xl font-bold mb-6 flex items-center gap-2"> <Shapes className="w-5 h-5 text-emerald-400" /> Vector Generator </h2>
               
               <div className="space-y-6">
                 {/* Vector Prompt */}
                 <div className="space-y-2">
                   <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold ml-1">Descriptive Prompt</label>
                   <textarea value={vectorPrompt} onChange={(e) => setVectorPrompt(e.target.value)} placeholder="e.g. A cute futuristic robot cat icon, minimalist clean lines..." className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all min-h-[100px] resize-none" />
                 </div>

                 {/* Vector Style Selector */}
                 <div className="space-y-2">
                   <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold ml-1">Vector Aesthetic</label>
                   <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
                      {VECTOR_STYLES.map(style => (
                        <button key={style.id} onClick={() => setVectorStyle(style)} className={clsx("p-2 rounded-xl border text-[10px] font-bold transition-all", vectorStyle.id === style.id ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-white/5 border-white/5 text-zinc-500 hover:bg-white/10 hover:text-zinc-300")}>
                          {style.name}
                        </button>
                      ))}
                   </div>
                 </div>

                 {/* Batch Size & Pro Toggle */}
                 <div className="flex flex-col gap-4 p-4 bg-black/40 rounded-2xl border border-white/5">
                    <div className="flex justify-between items-center">
                       <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Pro Mode (V4 Pro)</span>
                       <button onClick={() => { if(!isVectorPro) setIsProSwitchModalOpen(true); else setIsVectorPro(false); }} className={clsx("w-12 h-6 rounded-full p-1 transition-all", isVectorPro ? "bg-emerald-500" : "bg-zinc-800")}>
                          <div className={clsx("w-4 h-4 rounded-full bg-white transition-all shadow-md", isVectorPro ? "translate-x-6" : "translate-x-0")} />
                       </button>
                    </div>

                    <div className="space-y-2">
                       <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                          <span>BATCH SIZE</span>
                          <span className="text-emerald-400">{vectorBatchSize}</span>
                       </div>
                       <input type="range" min="1" max="10" value={vectorBatchSize} onChange={(e) => setVectorBatchSize(parseInt(e.target.value))} className="w-full accent-emerald-500 cursor-pointer" />
                    </div>

                    <div className="pt-2 border-t border-white/5 flex justify-between items-center">
                       <span className="text-[10px] text-zinc-500 font-bold">ESTIMATED COST</span>
                       <span className="text-xs font-black text-white">${(vectorBatchSize * (isVectorPro ? 0.30 : 0.08)).toFixed(2)}</span>
                    </div>
                 </div>

                 <button onClick={handleGenerateVector} disabled={isVectorGenerating || !vectorPrompt.trim()} className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold disabled:opacity-50 shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"> 
                    {isVectorGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Zap className="w-4 h-4" /> Generate Vector Assets</>}
                 </button>
               </div>
             </div>
          ) : (
            <div className="glass-panel p-6 rounded-2xl">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2"> <Upload className="w-5 h-5 text-pink-400" /> Manual Upload </h2>
              <div className="space-y-6">
                 <div onClick={() => fileInputRef.current?.click()} onDragOver={(e) => {e.preventDefault(); setIsDragging(true)}} onDragLeave={() => setIsDragging(false)} onDrop={(e) => {e.preventDefault(); setIsDragging(false); if(e.dataTransfer.files) Array.from(e.dataTransfer.files).forEach(processFile)}} className={clsx("border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all", isDragging ? "border-pink-500 bg-pink-500/10" : "border-white/10")}>
                    <input type="file" multiple ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
                    <Upload className="w-8 h-8 text-zinc-500" />
                    <p className="text-zinc-500 text-[10px] text-center">Seret banyak file ke sini atau klik untuk memilih.</p>
                 </div>

                 <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => handleBatchManual("remove_bg")} 
                      disabled={manualImages.length === 0 || isManualBatchProcessing || globalUpscaleState !== "IDLE" || isGenerating} 
                      className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold disabled:opacity-50 flex justify-center items-center gap-2 border border-white/10"
                    >
                       {isManualBatchProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5 text-indigo-400" />}
                       {globalUpscaleState === "COOLDOWN" ? `Tunggu (${upscaleCooldownTime}s)` : manualImages.some(m => m.isProcessing) ? "Memproses..." : "Hapus BG Massal"}
                    </button>
                    <button 
                      onClick={() => handleBatchManual("upscale")} 
                      disabled={manualImages.length === 0 || isManualBatchProcessing || globalUpscaleState !== "IDLE" || isGenerating} 
                      className="w-full py-4 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white rounded-xl font-bold disabled:opacity-50 flex justify-center items-center gap-2 shadow-lg shadow-pink-500/10"
                    >
                       {isManualBatchProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                       {globalUpscaleState === "COOLDOWN" ? `Jeda API (${upscaleCooldownTime}s)` : manualImages.some(m => m.isUpscaling) ? "Memproses..." : "Upscale 4K Massal"}
                    </button>
                 </div>
                 <button onClick={() => setManualImages([])} disabled={manualImages.length === 0} className="w-full py-3 bg-red-500/10 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold flex justify-center items-center gap-2">
                    <Trash2 className="w-4 h-4" /> Bersihkan Daftar
                 </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="lg:col-span-8 flex flex-col min-h-[600px]">
          <div className="glass-panel p-6 rounded-2xl flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2"> 
                {activeTab === 'vector' ? <Shapes className="w-5 h-5 text-emerald-400" /> : <ImageIcon className="w-5 h-5 text-pink-400" />}
                {activeTab === 'vector' ? 'Vector Asset Library' : 'Production Gallery'}
              </h2>
              {activeTab === 'vector' ? (
                vectorImages.length > 0 && (
                  <button onClick={handleClearAllVector} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border border-red-500/20"> <Trash2 className="w-3.5 h-3.5" /> Clear History </button>
                )
              ) : (
                (activeTab === "generator" ? generatedImages.length : manualImages.length) > 0 && (
                  <button onClick={() => handleDownloadZip(activeTab === "generator" ? "gen" : "manual")} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold flex items-center gap-2"><Download className="w-4 h-4" /> ZIP</button>
                )
              )}
            </div>

            {(isGenerating || isManualBatchProcessing || isVectorGenerating) && (
                <div className={clsx(
                  "mb-6 p-4 rounded-xl border animate-pulse",
                  isVectorGenerating ? "bg-emerald-500/10 border-emerald-500/30" : "bg-indigo-500/10 border-indigo-500/30"
                )}>
                   <p className={clsx(
                     "text-sm font-bold text-center italic",
                     isVectorGenerating ? "text-emerald-400" : "text-indigo-400"
                   )}>{progressText || "Memproses permintaan anda..."}</p>
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {activeTab === "vector" ? (
                vectorImages.map((vImg) => (
                  <VectorStickerCard key={vImg.id} img={vImg} onDelete={() => handleDeleteVector(vImg.id)} onPreview={(url) => setPreviewImage(url)} />
                ))
              ) : activeTab === "generator" ? (
                generatedImages.map((img, idx) => (
                  <StickerCard 
                    key={idx} 
                    img={img} 
                    onUpscale={() => handleUpscale(idx)} 
                    onPreview={() => setPreviewImage(img.upscaledUrl || img.url)} 
                    onRefine={(initialMode) => { 
                      setRefineAmount(1); 
                      setStudioMode(initialMode || 'REFINE');
                      setStudioTarget({idx, tab: 'gen'}); 
                    }}
                    onDelete={() => handleDeleteAI(idx)}
                    globalLock={globalUpscaleState !== "IDLE" || isGenerating} 
                    upscaleCooldownTime={upscaleCooldownTime}
                  />
                ))
              ) : (
                manualImages.map((img, idx) => (
                  <div key={img.id} className="group relative">
                    <ManualCard 
                      img={img} 
                      idx={idx}
                      onManualAction={handleManualAction}
                      onCropOpen={(idx) => {
                        setStudioTarget({idx, tab: 'manual'}); 
                        setStudioMode('CROP');
                        setCrop(undefined); 
                        setCropAspect(undefined);
                        setShowCropControls(true);
                      }}
                      onPreview={(url) => setPreviewImage(url)}
                      onRefine={(idx, initialMode) => { 
                        setRefineAmount(1); 
                        setStudioMode(initialMode || 'REFINE');
                        setStudioTarget({idx, tab: 'manual'}); 
                      }}
                      onDelete={(id) => setManualImages(m => m.filter(x => x.id !== id))}
                      globalLock={globalUpscaleState !== "IDLE" || isManualBatchProcessing || isGenerating}
                      upscaleCooldownTime={upscaleCooldownTime}
                      isManualBatchProcessing={isManualBatchProcessing}
                      isGenerating={isGenerating}
                    />
                  </div>
                ))
              )}
            </div>
            {((activeTab === "generator" ? generatedImages.length : activeTab === "manual" ? manualImages.length : vectorImages.length) === 0) && (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-700"><ImageIcon className="w-12 h-12 mb-2 opacity-20" /> <p className="text-sm">Gallery Kosong</p></div>
            )}
          </div>
        </div>
      </div>

      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewImage || ""} alt="Preview" className="max-w-full max-h-full object-contain" />
        </div>
      )}

      {/* Ultimate Universal Studio Modal (v11.0) */}
      {studioTarget !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center sm:p-4 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-3xl" />
          
          <div className="relative w-full h-full max-w-7xl bg-zinc-950 sm:rounded-[32px] overflow-hidden flex flex-col border border-white/10 shadow-2xl">
            <div className="p-2 md:p-5 border-b border-white/5 flex flex-row items-center justify-between bg-zinc-900/50 gap-2 md:gap-4">
              {!isMobile && (
                <div className="flex items-center gap-4 w-full md:w-auto">
                  <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
                    <Wrench className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white leading-tight">Ultimate Studio</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">Professional Editor</span>
                    </div>
                  </div>
                </div>
              )}
 
               {/* Mode Tabs */}
               <div className="flex bg-black/40 p-1 rounded-2xl border border-white/5 w-full md:w-auto">
                 <button 
                   onClick={() => setStudioMode('CROP')} 
                   className={clsx(
                     "flex-1 md:flex-none px-3 md:px-6 py-1.5 md:py-2 rounded-xl text-[10px] md:text-xs font-bold transition-all flex items-center justify-center gap-1.5 md:gap-2",
                     studioMode === 'CROP' ? "bg-white text-zinc-950 shadow-lg" : "text-zinc-500 hover:text-white disabled:opacity-20 disabled:grayscale"
                   )}
                 >
                   <Scissors className="w-3 md:w-3.5 h-3 md:h-3.5" /> <span>Potong</span>
                 </button>
                 <button 
                   onClick={() => setStudioMode('REFINE')} 
                   className={clsx(
                     "flex-1 md:flex-none px-3 md:px-6 py-1.5 md:py-2 rounded-xl text-[10px] md:text-xs font-bold transition-all flex items-center justify-center gap-1.5 md:gap-2",
                     studioMode === 'REFINE' ? "bg-white text-zinc-950 shadow-lg" : "text-zinc-500 hover:text-white"
                   )}
                 >
                   <Sparkles className="w-3 md:w-3.5 h-3 md:h-3.5" /> <span>Refine</span>
                 </button>
                 <button 
                   onClick={() => setStudioMode('CLEANUP')} 
                   className={clsx(
                     "flex-1 md:flex-none px-3 md:px-6 py-1.5 md:py-2 rounded-xl text-[10px] md:text-xs font-bold transition-all flex items-center justify-center gap-1.5 md:gap-2",
                     studioMode === 'CLEANUP' ? "bg-white text-zinc-950 shadow-lg" : "text-zinc-500 hover:text-white"
                   )}
                 >
                   <Wand2 className="w-3 md:w-3.5 h-3 md:h-3.5" /> <span>Bersihkan</span>
                 </button>
               </div>
 
               <div className="flex items-center gap-2">
                 <button 
                   onClick={() => { setStudioTarget(null); setShowStudioControls(false); }}
                   className="p-1.5 md:p-2 hover:bg-white/5 text-zinc-500 hover:text-white rounded-full transition-all"
                 >
                   <X className="w-5 md:w-6 h-5 md:h-6" />
                 </button>
               </div>
             </div>

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
              {/* Main Stage */}
              <div className="flex-1 min-h-0 relative bg-black overflow-hidden group">
                <div className="absolute inset-0 flex items-center justify-center p-4 md:p-8">
                  {studioMode === 'REFINE' ? (
                    <div className="relative">
                       <img
                        alt="Refine Target"
                        crossOrigin="anonymous"
                        src={refinedPreviewUrl || stableStudioUrl}
                        className="object-contain block select-none pointer-events-none rounded shadow-2xl transition-all duration-300"
                        style={{ 
                          maxHeight: isMobile ? 'calc(100vh - 350px)' : 'calc(100vh - 220px)',
                          maxWidth: '100%'
                        }}
                      />
                      {isRefining && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[2px] rounded">
                           <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
                        </div>
                      )}
                    </div>
                  ) : studioMode === 'CLEANUP' ? (
                      <div 
                        className={clsx(
                          "relative group/cleanup overflow-hidden bg-zinc-950/20 rounded-xl",
                          (isPanMode || isSpacePressed) ? "cursor-grab active:cursor-grabbing" : cleanupTool === 'ERASER' ? "cursor-none" : "cursor-crosshair"
                        )}
                        onWheel={handleWheel}
                        onPointerMove={(e) => {
                          const containerRect = e.currentTarget.getBoundingClientRect();
                          const x = e.clientX - containerRect.left;
                          const y = e.clientY - containerRect.top;
                          setBrushCirclePos({ x, y });

                          if (isPanning) {
                            const dx = e.clientX - lastPanPos.x;
                            const dy = e.clientY - lastPanPos.y;
                            setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
                            setLastPanPos({ x: e.clientX, y: e.clientY });
                          }
                        }}
                        onPointerDown={(e) => {
                          if (isPanMode || isSpacePressed || e.button === 1) {
                            setIsPanning(true);
                            setLastPanPos({ x: e.clientX, y: e.clientY });
                          }
                        }}
                        onPointerUp={() => setIsPanning(false)}
                        onPointerLeave={() => { setBrushCirclePos(null); setIsPanning(false); }}
                      >
                        <div 
                           style={{ 
                             transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                             transformOrigin: 'center center',
                             transition: isPanning ? 'none' : 'transform 0.1s ease-out'
                           }}
                        >
                          <canvas 
                            ref={cleanupCanvasRef}
                            onMouseDown={(e) => {
                              if (isPanning || isPanMode || isSpacePressed || e.button === 1) return;
                              saveCleanupState();
                              if (cleanupTool === 'WAND') handleMagicWand(e);
                              else handleEraserMove(e);
                            }}
                            onTouchStart={(e) => {
                              if (e.touches.length > 1) {
                                setIsPanning(true);
                                setLastPanPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
                                return;
                              }
                              e.preventDefault();
                              saveCleanupState();
                              if (cleanupTool === 'WAND') handleMagicWand(e);
                              else handleEraserMove(e);
                            }}
                            onMouseMove={(e) => {
                              if (isPanning) return;
                              if (cleanupTool === 'ERASER') handleEraserMove(e);
                            }}
                            onTouchMove={(e) => {
                              if (isPanning) {
                                const dx = e.touches[0].clientX - lastPanPos.x;
                                const dy = e.touches[0].clientY - lastPanPos.y;
                                setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
                                setLastPanPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
                                return;
                              }
                              e.preventDefault();
                              if (cleanupTool === 'ERASER') handleEraserMove(e);
                            }}
                            onMouseUp={finalizeCleanup}
                            onTouchEnd={(e) => { e.preventDefault(); finalizeCleanup(); setIsPanning(false); }}
                            style={{ 
                              maxHeight: isMobile ? 'calc(100vh - 350px)' : 'calc(100vh - 220px)',
                              maxWidth: '100%',
                              height: 'auto'
                            }}
                            className="rounded shadow-2xl bg-[url('https://www.transparenttextures.com/patterns/checkerboard.png')] bg-zinc-800 pointer-events-auto"
                          />
                        </div>
                        
                        {/* Visual Brush Preview */}
                        {cleanupTool === 'ERASER' && brushCirclePos && !isPanning && !isPanMode && !isSpacePressed && (
                          <div 
                            className="pointer-events-none absolute border border-white/50 rounded-full bg-indigo-500/10 backdrop-blur-[1px] transform -translate-x-1/2 -translate-y-1/2 border-dashed transition-[width,height] duration-75"
                            style={{
                              left: brushCirclePos?.x || 0,
                              top: brushCirclePos?.y || 0,
                              width: (brushSize * zoom) || 0,
                              height: (brushSize * zoom) || 0,
                              boxShadow: '0 0 15px rgba(99, 102, 241, 0.4)'
                            }}
                          />
                        )}
                      {isCleaning && (
                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                          <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <ReactCrop
                      crop={crop!}
                      onChange={(c) => setCrop(c)}
                      onComplete={(c) => setCompletedCrop(c)}
                      aspect={cropAspect}
                      className="shadow-2xl shadow-white/5"
                    >
                      <img
                        ref={imgRef}
                        alt="Cropme"
                        crossOrigin="anonymous"
                        src={stableStudioUrl}
                        onLoad={onImageLoad}
                        style={{ 
                          maxHeight: isMobile ? 'calc(100vh - 350px)' : 'calc(100vh - 220px)',
                          maxWidth: '100%'
                        }}
                        className="object-contain block select-none pointer-events-none rounded shadow-2xl"
                      />
                    </ReactCrop>
                  )}
                </div>

                {isMobile && (
                  <div className="absolute bottom-6 right-6 flex flex-col gap-4 z-[90]">
                    <button 
                      onClick={() => setShowStudioControls(!showStudioControls)}
                      className={clsx(
                        "w-12 h-12 rounded-full flex items-center justify-center shadow-2xl transition-all border",
                        showStudioControls ? "bg-white text-zinc-950 border-white rotate-90" : "bg-indigo-600 text-white border-indigo-500 shadow-indigo-500/40"
                      )}
                    >
                      {showStudioControls ? <X className="w-6 h-6" /> : <Sliders className="w-6 h-6" />}
                    </button>
                  </div>
                )}
              </div>

              {/* Sidebar controls */}
              <div className={clsx(
                "w-full md:w-[320px] bg-zinc-900 border-t md:border-t-0 md:border-l border-white/5 flex flex-col transition-all duration-500 overflow-hidden",
                isMobile 
                  ? clsx(
                      "fixed inset-x-0 bottom-0 z-[100] bg-zinc-950/95 backdrop-blur-2xl rounded-t-[32px] border-t border-white/10 shadow-[0_-8px_40px_rgba(0,0,0,0.8)] p-8 pt-10",
                      showStudioControls ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
                    )
                  : "p-6 overflow-y-auto"
              )}>
                {isMobile && (
                  <div className="w-12 h-1.5 bg-white/10 rounded-full absolute top-4 left-1/2 -translate-x-1/2" />
                )}
                {isMobile && (
                  <button 
                    onClick={() => setShowStudioControls(false)}
                    className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
                <div className="flex-1 space-y-8">
                  {studioMode === 'REFINE' && (
                    <div className="space-y-6">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Refinement Control</span>
                        <p className="text-[10px] text-zinc-500">Menipiskan pinggiran sticker secara global.</p>
                      </div>
                      <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-zinc-400">Ketebalan Kikis</span>
                          <span className="text-xl font-black text-indigo-400">{refineAmount}px</span>
                        </div>
                        <input type="range" min="1" max="50" value={refineAmount} onChange={(e) => setRefineAmount(parseInt(e.target.value))} className="w-full accent-indigo-500" />
                      </div>
                    </div>
                  )}

                  {studioMode === 'CLEANUP' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between pb-2 border-b border-white/5">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Cleanup Toolkit</span>
                          <p className="text-[10px] text-zinc-500">Undo/Redo tersedia.</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button 
                            onClick={handleUndo} 
                            disabled={cleanupHistory.length === 0}
                            className="p-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-20 text-white rounded-lg transition-all"
                            title="Undo (Ctrl+Z)"
                          >
                            <Undo2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={handleRedo} 
                            disabled={cleanupRedoStack.length === 0}
                            className="p-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-20 text-white rounded-lg transition-all"
                            title="Redo"
                          >
                            <Redo2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Tool Picker */}
                      <div className="grid grid-cols-3 gap-2 bg-black/20 p-1.5 rounded-2xl border border-white/5">
                        <button 
                          onClick={() => { setCleanupTool('WAND'); setIsPanMode(false); }}
                          className={clsx(
                            "py-2.5 rounded-xl font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 text-[9px]",
                            (cleanupTool === 'WAND' && !isPanMode) ? "bg-indigo-500 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
                          )}
                        >
                          <Wand2 className="w-3.5 h-3.5" />
                          Wand
                        </button>
                        <button 
                          onClick={() => { setCleanupTool('ERASER'); setIsPanMode(false); }}
                          className={clsx(
                            "py-2.5 rounded-xl font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 text-[9px]",
                            (cleanupTool === 'ERASER' && !isPanMode) ? "bg-indigo-500 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
                          )}
                        >
                          <Eraser className="w-3.5 h-3.5" />
                          Eraser
                        </button>
                        <button 
                          onClick={() => setIsPanMode(!isPanMode)}
                          className={clsx(
                            "py-2.5 rounded-xl font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 text-[9px]",
                            (isPanMode || isSpacePressed) ? "bg-zinc-100 text-zinc-950 shadow-lg" : "text-zinc-500 hover:text-zinc-300"
                          )}
                        >
                          <Hand className="w-3.5 h-3.5" />
                          Pan
                        </button>
                      </div>

                      {/* Zoom Controls */}
                      <div className="flex items-center gap-2 bg-black/40 p-2 rounded-xl border border-white/5">
                         <button onClick={() => setZoom(prev => Math.max(0.5, prev - 0.2))} className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white">
                           <ZoomOut className="w-4 h-4" />
                         </button>
                         <div className="flex-1 text-center text-[10px] font-black text-indigo-400 tabular-nums">
                           {Math.round(zoom * 100)}%
                         </div>
                         <button onClick={() => setZoom(prev => Math.min(10, prev + 0.2))} className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white">
                           <ZoomIn className="w-4 h-4" />
                         </button>
                         <button onClick={() => { setZoom(1); setPanOffset({x:0, y:0}); }} className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white" title="Reset Zoom">
                           <Maximize className="w-4 h-4" />
                         </button>
                      </div>

                      <div className="space-y-6 pt-2 h-40">
                      {isPanMode || isSpacePressed ? (
                        <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                           <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold text-center">Pan Mode Active</span>
                            <p className="text-[10px] text-zinc-500 text-center">Seret gambar untuk berpindah posisi.</p>
                          </div>
                        </div>
                      ) : cleanupTool === 'WAND' ? (
                        <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Wand Settings</span>
                            <p className="text-[10px] text-zinc-500">Klik warna untuk menghapus area besar.</p>
                          </div>
                          <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-4">
                            <div className="flex justify-between items-center text-xs font-bold text-zinc-400">
                              <span>Toleransi Warna</span>
                              <span>{wandTolerance}%</span>
                            </div>
                            <input type="range" min="1" max="100" value={wandTolerance} onChange={(e) => setWandTolerance(parseInt(e.target.value))} className="w-full accent-indigo-500" />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Eraser Settings</span>
                            <p className="text-[10px] text-zinc-500">Seret untuk menghapus detail manual.</p>
                          </div>
                          <div className="bg-black/40 p-4 rounded-2xl border border-white/5 space-y-4">
                            <div className="flex justify-between items-center text-xs font-bold text-zinc-400">
                              <span>Ukuran Kuas</span>
                              <span>{brushSize}px</span>
                            </div>
                            <input type="range" min="1" max="100" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-full accent-indigo-500" />
                          </div>
                        </div>
                      )}
                      </div>
                    </div>
                  )}

                  {studioMode === 'CROP' && (
                    <div className="space-y-6">
                       <div className="flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Aspect Ratio</span>
                        <p className="text-[10px] text-zinc-500">Sesuaikan bentuk potongan gambar.</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: "Bebas", val: undefined },
                          { label: "1:1 Square", val: 1 },
                          { label: "4:5 Portrait", val: 0.8 },
                          { label: "9:16 Story", val: 0.5625 },
                          { label: "3:2 Landscape", val: 1.5 },
                          { label: "16:9 Cinematic", val: 1.7777777777777777 },
                        ].map((ratio) => (
                          <button
                            key={ratio.label}
                            onClick={() => {
                                setCropAspect(ratio.val);
                                if (imgRef.current) {
                                   const { width: dW, height: dH } = imgRef.current;
                                   const imgA = dW / dH;
                                   let nC: Crop;
                                   if (ratio.val) {
                                     nC = centerCrop(makeAspectCrop({ unit: '%', [imgA > ratio.val ? 'height' : 'width']: 100 }, ratio.val, dW, dH), dW, dH);
                                   } else { nC = { unit: '%', x: 0, y: 0, width: 100, height: 100 }; }
                                   setCrop(nC);
                                }
                            }}
                            className={clsx(
                              "py-2.5 rounded-xl font-bold flex flex-col items-center justify-center border transition-all active:scale-95 text-[10px]",
                              cropAspect === ratio.val ? "bg-white text-zinc-950 border-white shadow-lg" : "bg-zinc-800 text-zinc-400 border-white/5"
                            )}
                          >
                            {ratio.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-white/5">
                  <button 
                    onClick={studioMode === 'CROP' ? handleSaveCrop : handleSaveRefine}
                    disabled={isCropping || isRefining || isCleaning}
                    className="w-full py-4 bg-indigo-500 hover:bg-indigo-400 text-white rounded-2xl flex items-center justify-center gap-2 font-black uppercase tracking-widest shadow-lg shadow-indigo-500/30 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {(isCropping || isRefining || isCleaning) ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                    Simpan Perubahan
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- VECTOR ENTRANCE MODAL WITH PASSWORD (v12.1) --- */}
      {isVectorWarningOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
           <div className="w-full max-w-xl glass-panel p-1 border border-white/20 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
              <div className="absolute inset-x-0 -top-12 -bottom-12 bg-gradient-to-br from-emerald-500/20 via-transparent to-cyan-500/20 blur-3xl" />
              <div className="relative bg-zinc-950/80 rounded-[2rem] p-10 flex flex-col items-center">
                 <div className="w-24 h-24 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-3xl flex items-center justify-center shadow-2xl shadow-emerald-500/40 mb-8 animate-in zoom-in-50 duration-500">
                    <Lock className="w-12 h-12 text-zinc-950" />
                 </div>
                 <h2 className="text-3xl font-black text-white text-center mb-4 tracking-tight">Autorisasi Diperlukan</h2>
                 <p className="text-zinc-400 text-center mb-6 leading-relaxed max-w-[360px]">
                    Halaman ini memiliki biaya operasional tinggi. Silakan masukkan **Vector Access PIN** untuk melanjutkan.
                 </p>
                 
                 <div className="w-full mb-8">
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500/50" />
                      <input 
                        type="password" 
                        value={vectorPinInput}
                        onChange={(e) => setVectorPinInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && vectorPinInput === VECTOR_PIN) {
                            setIsVectorAuthenticated(true);
                            setIsVectorWarningOpen(false);
                            setVectorPinInput("");
                          }
                        }}
                        placeholder="ENTER ACCESS PIN..." 
                        className="w-full py-4 pl-12 pr-4 bg-white/5 border border-white/10 rounded-2xl text-center font-black tracking-[0.5em] text-emerald-400 focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all"
                      />
                    </div>
                    {vectorPinInput && vectorPinInput !== VECTOR_PIN && (
                      <p className="text-red-400 text-[10px] font-bold text-center mt-2 uppercase tracking-widest animate-pulse">PIN TIDAK VALID</p>
                    )}
                 </div>

                 <div className="grid grid-cols-1 w-full gap-4">
                    <button 
                      onClick={() => {
                        if (vectorPinInput === VECTOR_PIN) {
                          setIsVectorAuthenticated(true);
                          setIsVectorWarningOpen(false);
                          setVectorPinInput("");
                        }
                      }} 
                      disabled={vectorPinInput !== VECTOR_PIN}
                      className="py-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 disabled:grayscale text-zinc-950 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-95"
                    >
                       Akses Vector Studio
                    </button>
                    <button onClick={() => { setActiveTab("generator"); setIsVectorWarningOpen(false); setVectorPinInput(""); }} className="py-4 text-zinc-500 hover:text-white transition-colors text-sm font-bold">
                       Kembali ke AI Generator
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* --- PRO SWITCH WARNING MODAL (v12.0) --- */}
      {isProSwitchModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="w-full max-w-md glass-panel p-1 border border-emerald-500/30 rounded-[2rem] shadow-2xl">
              <div className="bg-zinc-950/90 rounded-[1.8rem] p-8 flex flex-col items-center">
                 <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center mb-6">
                    <AlertCircle className="w-8 h-8 text-amber-500" />
                 </div>
                 <h3 className="text-xl font-bold text-white mb-3 text-center tracking-tight">Aktifkan Pro Vector Mode?</h3>
                 <p className="text-zinc-500 text-sm text-center mb-8 px-4 leading-relaxed">
                    Model **Recraft V4 Pro** menghasilkan detail geometris yang jauh lebih halus.
                    Biaya API meningkat menjadi <span className="text-amber-400 font-bold">$0.30 per gambar</span>.
                 </p>
                 <div className="flex flex-col w-full gap-3">
                    <button onClick={() => { setIsVectorPro(true); setIsProSwitchModalOpen(false); }} className="w-full py-4 bg-emerald-500 text-zinc-950 font-black rounded-xl uppercase tracking-widest shadow-xl shadow-emerald-500/20">
                       Aktifkan Mode Pro
                    </button>
                    <button onClick={() => setIsProSwitchModalOpen(false)} className="w-full py-4 text-zinc-500 font-bold">Batal</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

function VectorStickerCard({ img, onDelete, onPreview }: {
  img: {id: string, url: string, timestamp: number, isPro: boolean},
  onDelete: () => void,
  onPreview: (url: string) => void
}) {
  return (
    <div className="group relative aspect-square rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 hover:border-indigo-500/50 transition-all shadow-xl">
       {/* v12.0: Checkered Background for Vector Preview */}
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'conic-gradient(#fff 0.25turn, #000 0.25turn 0.5turn, #fff 0.5turn 0.75turn, #000 0.75turn)', backgroundSize: '20px 20px' }} />
      
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <img 
          src={img.url} 
          alt="Vector Result" 
          className="max-w-full max-h-full object-contain drop-shadow-2xl cursor-pointer transition-transform group-hover:scale-105"
          onClick={() => onPreview(img.url)}
          loading="lazy"
        />
      </div>

      <div className="absolute top-2 left-2 flex gap-1">
        <div className={clsx(
          "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter",
          img.isPro ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-zinc-800 text-zinc-400"
        )}>
          {img.isPro ? "Pro SVG" : "Basic SVG"}
        </div>
      </div>

      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-sm">
        <button 
          onClick={(e) => { e.stopPropagation(); onPreview(img.url); }}
          className="w-10 h-10 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl flex items-center justify-center shadow-lg transition-all hover:scale-110 active:scale-95"
          title="Full Preview"
        >
          <Maximize className="w-5 h-5" />
        </button>
        <button 
          onClick={(e) => { 
            e.stopPropagation(); 
            saveAs(img.url, `vector_${img.id}.svg`);
          }}
          className="w-10 h-10 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl flex items-center justify-center shadow-lg transition-all hover:scale-110 active:scale-95"
          title="Download SVG"
        >
          <Download className="w-5 h-5" />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="w-10 h-10 bg-red-500/20 hover:bg-red-500/40 text-red-500 rounded-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
          title="Delete"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      <div className="absolute bottom-2 right-2 text-[8px] text-zinc-600 font-mono">
        {new Date(img.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}

function StickerCard({ img, onUpscale, onPreview, onRefine, onDelete, globalLock, upscaleCooldownTime }: {
  img: any,
  onUpscale: () => void,
  onPreview: () => void,
  onRefine: (initialMode?: 'REFINE' | 'CLEANUP' | 'CROP') => void,
  onDelete: () => void,
  globalLock: boolean,
  upscaleCooldownTime: number
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showTools, setShowTools] = useState(false);
  
  return (
    <div 
      className="aspect-square bg-white/5 border border-white/5 rounded-xl relative group animate-in zoom-in-50 duration-500 cursor-pointer"
      onClick={() => setShowMenu(!showMenu)}
    >
      <div className="absolute inset-0 overflow-hidden rounded-xl z-0">
        {img.upscaledUrl && !showMenu && (
          <div className="absolute top-2 left-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg z-20">
            4K HD
          </div>
        )}
        {img.isUpscaling && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-10 h-10 animate-spin text-pink-500" />
            <p className="text-white text-sm font-semibold animate-pulse">Menajamkan 4K...</p>
          </div>
        )}
        <img 
          src={img.upscaledUrl || img.url} 
          alt="Sticker" 
          className="w-full h-full object-contain p-2 transition-transform duration-500 group-hover:scale-110" 
        />
      </div>

      <div className={clsx(
        "absolute top-3 right-3 text-white/40 sm:hidden transition-opacity z-20",
        showMenu ? "opacity-0" : "opacity-100"
      )}>
        <MoreVertical className="w-5 h-5 drop-shadow-lg" />
      </div>

      <div className={clsx(
        "absolute -inset-[1.5px] bg-zinc-950 transition-all duration-300 z-10 flex flex-col items-center justify-center pt-10 pb-4 px-4 gap-2 rounded-xl border border-white/20 shadow-2xl overflow-visible",
        img.isUpscaling ? "hidden" : showMenu ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
      )}>
        {showMenu && (
          <button 
            onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}
            className="absolute top-2 right-2 p-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-xl rounded-full text-white sm:hidden z-30 border border-white/10 transition-transform active:scale-90"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="w-full grid grid-cols-2 gap-2">
          {!img.upscaledUrl ? (
            <button 
              onClick={(e) => { e.stopPropagation(); onUpscale(); }} 
              disabled={globalLock || img.isUpscaling} 
              className="w-full py-2 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white rounded-lg border border-white/10 disabled:opacity-40 transition-all active:scale-95 flex flex-col items-center justify-center gap-0.5"
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-[9px] font-extrabold uppercase tracking-tight hidden sm:inline">{globalLock ? `${upscaleCooldownTime}s` : "Upscale 4K"}</span>
              {globalLock && <span className="text-[9px] font-extrabold sm:hidden">{upscaleCooldownTime}s</span>}
            </button>
          ) : (
            <div className="w-full py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold border border-emerald-500/30 flex flex-col items-center justify-center gap-0.5">
              <ShieldCheck className="w-4 h-4" /> <span className="text-[9px] uppercase tracking-tight hidden sm:inline">4K READY</span>
            </div>
          )}
          
          <div className="relative">
            <button 
              onClick={(e) => { e.stopPropagation(); setShowTools(!showTools); }} 
              className="w-full h-full py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 rounded-lg flex flex-col items-center justify-center transition-colors group/tools border border-white/10" 
              title="Studio Tools"
            >
              <Wrench className="w-4 h-4" />
              <span className="text-[9px] font-extrabold uppercase tracking-tight mt-0.5 hidden sm:inline">Tools</span>
            </button>
            <div className={clsx(
              "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 bg-zinc-950/90 backdrop-blur-3xl border border-white/20 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] transition-all p-1.5 flex flex-col gap-1 z-[60]",
              showTools ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none group-hover/tools:opacity-100 group-hover/tools:scale-100 group-hover/tools:pointer-events-auto"
            )}>
               <div className="absolute top-full left-0 right-0 h-4" />
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowTools(false); onRefine('CROP'); }} 
                  className="w-full py-2 px-3 hover:bg-amber-500/20 rounded-xl text-[10px] font-bold flex items-center gap-1.5 text-amber-400 border border-transparent hover:border-amber-500/30 transition-all"
                >
                  <Scissors className="w-4 h-4" /> Potong
                </button>
                <button onClick={(e) => { e.stopPropagation(); setShowTools(false); onRefine('REFINE'); }} className="w-full py-2 px-3 hover:bg-emerald-500/20 rounded-xl text-[10px] font-bold flex items-center gap-1.5 text-emerald-400 border border-transparent hover:border-emerald-500/30 transition-all"><Sparkles className="w-4 h-4" /> Refine</button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowTools(false); onRefine('CLEANUP'); }} 
                  className="w-full py-2 px-3 hover:bg-indigo-500/20 rounded-xl text-[10px] font-bold flex items-center gap-1.5 text-indigo-400 border border-transparent hover:border-indigo-500/30 transition-all"
                >
                  <Wand2 className="w-4 h-4" /> Cleanup
                </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 w-full gap-2 border-t border-white/10 pt-3 mt-1">
          <button onClick={(e) => { e.stopPropagation(); onPreview(); }} className="py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex flex-col items-center justify-center transition-colors px-1" title="View"><Maximize className="w-3.5 h-3.5" /><span className="text-[7px] font-bold mt-0.5 hidden sm:inline">PREVIEW</span></button>
          <button onClick={(e) => { e.stopPropagation(); saveAs(img.upscaledUrl || img.url, "sticker.png"); }} className="py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg flex flex-col items-center justify-center transition-colors px-1" title="Save"><Download className="w-3.5 h-3.5" /><span className="text-[7px] font-bold mt-0.5 text-center uppercase tracking-tighter hidden sm:inline text-white">SAVE</span></button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg flex flex-col items-center justify-center transition-colors px-1 border border-red-500/20" title="Hapus"><Trash2 className="w-3.5 h-3.5" /><span className="text-[7px] font-bold mt-0.5 hidden sm:inline">HAPUS</span></button>
        </div>
      </div>
    </div>
  );
}

function ManualCard({ img, idx, onManualAction, onCropOpen, onPreview, onRefine, onDelete, globalLock, upscaleCooldownTime, isManualBatchProcessing, isGenerating }: { 
  img: any, 
  idx: number, 
  onManualAction: (idx: number, type: "remove_bg" | "upscale") => void, 
  onCropOpen: (idx: number) => void, 
  onPreview: (url: string) => void, 
  onRefine: (idx: number, initialMode?: 'REFINE' | 'CLEANUP' | 'CROP') => void,
  onDelete: (id: string) => void, 
  globalLock: boolean, 
  upscaleCooldownTime: number, 
  isManualBatchProcessing: boolean, 
  isGenerating: boolean 
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showTools, setShowTools] = useState(false);

  return (
    <div 
      className="aspect-square bg-white/5 border border-white/5 rounded-xl relative group animate-in fade-in duration-300 cursor-pointer"
      onClick={() => setShowMenu(!showMenu)}
    >
       <div className="absolute inset-0 overflow-hidden rounded-xl z-0">
          {!showMenu && (
            <div className="absolute top-2 left-2 flex gap-1 z-20">
               {img.url !== img.originalUrl && <div className="bg-indigo-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm">B-FREE</div>}
               {img.upscaledUrl && <div className="bg-emerald-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm">4K</div>}
            </div>
          )}
          {(img.isProcessing || img.isUpscaling) && (
             <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-30 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
             </div>
          )}
          <img 
            src={img.upscaledUrl || img.url} 
            alt="Manual" 
            className="w-full h-full object-contain p-2 transition-transform duration-500 group-hover:scale-105" 
          />
       </div>

      <div className={clsx(
        "absolute top-3 right-3 text-white/40 sm:hidden transition-opacity z-20",
        showMenu ? "opacity-0" : "opacity-100"
      )}>
        <MoreVertical className="w-5 h-5 drop-shadow-lg" />
      </div>

       <div className={clsx(
         "absolute -inset-[1.5px] bg-zinc-950 transition-all duration-300 z-10 flex flex-col items-center justify-center pt-8 pb-4 px-4 gap-3 rounded-xl border border-white/20 shadow-2xl overflow-visible",
         (img.isProcessing || img.isUpscaling) ? "hidden" : showMenu ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
       )}>
          {showMenu && (
            <button 
              onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}
               className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 backdrop-blur-xl rounded-full text-white/60 sm:hidden z-30 border border-white/10"
             >
               <X className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="grid grid-cols-3 gap-2 w-full">
             <button 
               onClick={(e) => { e.stopPropagation(); onManualAction(idx, "remove_bg"); }} 
               disabled={img.isProcessing || img.isBackgroundRemoved || globalLock} 
               className="py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex flex-col items-center justify-center gap-1 border border-white/10 disabled:opacity-40 transition-colors"
               title="Remove BG"
             >
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                <span className="text-[8px] font-bold hidden sm:inline text-zinc-400">HAPUS BG</span>
             </button>
             <button 
               onClick={(e) => { e.stopPropagation(); onManualAction(idx, "upscale"); }} 
               disabled={img.isUpscaling || !!img.upscaledUrl || globalLock} 
               className="py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg flex flex-col items-center justify-center gap-1 shadow-lg shadow-indigo-500/20 disabled:opacity-40 transition-colors"
               title="Upscale 4K"
             >
                <Sparkles className="w-4 h-4" />
                <span className="text-[8px] font-bold hidden sm:inline text-white text-center">UPSCALE 4K</span>
             </button>
             <div className="relative flex-1">
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowTools(!showTools); }} 
                  className="w-full h-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex flex-col items-center justify-center gap-1 border border-white/10 transition-colors group/tools"
                  title="Studio Tools"
                >
                   <Wrench className="w-4 h-4 text-emerald-400" />
                   <span className="text-[8px] font-bold hidden sm:inline text-zinc-400 uppercase tracking-tighter">Tools</span>
                </button>
                <div className={clsx(
                  "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-36 bg-zinc-950/90 backdrop-blur-3xl border border-white/20 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] transition-all p-2 flex flex-col gap-1.5 z-[60]",
                  showTools ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none group-hover/tools:opacity-100 group-hover/tools:scale-100 group-hover/tools:pointer-events-auto"
                )}>
                  <div className="absolute top-full left-0 right-0 h-4" />
                  <button onClick={(e) => { e.stopPropagation(); setShowTools(false); onCropOpen(idx); }} className="w-full py-2 px-3 hover:bg-amber-500/20 rounded-xl text-[11px] font-bold flex items-center gap-2 text-amber-400 border border-transparent hover:border-amber-500/30 transition-all"><Scissors className="w-4 h-4" /> Potong</button>
                  <button onClick={(e) => { e.stopPropagation(); setShowTools(false); onRefine(idx, 'REFINE'); }} className="w-full py-2 px-3 hover:bg-emerald-500/20 rounded-xl text-[11px] font-bold flex items-center gap-2 text-emerald-400 border border-transparent hover:border-emerald-500/30 transition-all"><Sparkles className="w-4 h-4" /> Refine</button>
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      setShowTools(false);
                      onRefine(idx, 'CLEANUP'); 
                    }} 
                    className="w-full py-2 px-3 hover:bg-indigo-500/20 rounded-xl text-[11px] font-bold flex items-center gap-2 text-indigo-400 border border-transparent hover:border-indigo-500/30 transition-all"
                  >
                    <Wand2 className="w-4 h-4" /> Cleanup
                  </button>
                </div>
             </div>
          </div>
          
          <div className="flex w-full gap-2 border-t border-white/10 pt-3">
            <button onClick={(e) => { e.stopPropagation(); onPreview(img.upscaledUrl || img.url); }} className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex flex-col items-center justify-center transition-colors px-1" title="Preview"><Maximize className="w-3.5 h-3.5" /><span className="text-[7px] font-bold mt-0.5 hidden sm:inline">VIEW</span></button>
            <button onClick={(e) => { e.stopPropagation(); saveAs(img.upscaledUrl || img.url, `Sticker_${idx}.png`); }} className="flex-1 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg flex flex-col items-center justify-center transition-colors shadow-inner px-1" title="Download"><Download className="w-3.5 h-3.5" /><span className="text-[7px] font-bold mt-0.5 text-center uppercase tracking-tighter hidden sm:inline">Download</span></button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(img.id); }} className="flex-1 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-500 rounded-lg flex flex-col items-center justify-center transition-colors px-1" title="Delete"><Trash2 className="w-3.5 h-3.5" /><span className="text-[7px] font-bold mt-0.5 uppercase tracking-widest hidden sm:inline">Delete</span></button>
          </div>
       </div>
    </div>
  );
}
