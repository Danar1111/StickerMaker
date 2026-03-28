import { NextResponse } from "next/server";
import https from "node:https";
import fs from "node:fs/promises";
import path from "node:path";

export const maxDuration = 60;

// Native HTTPS request — bypasses Next.js patched fetch yang menyebabkan ETIMEDOUT
function httpsRequest(url: string, options: { method?: string; headers?: Record<string, string>; body?: string; }): Promise<{ status: number; data: any }> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const req = https.request({
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || "GET",
            headers: options.headers || {},
            family: 4, // Force IPv4
            timeout: 120000, // 2 min timeout
        }, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                try {
                    resolve({ status: res.statusCode || 200, data: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode || 200, data });
                }
            });
        });

        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("Request timeout (120s)")); });

        if (options.body) req.write(options.body);
        req.end();
    });
}

/**
 * Mengambil gambar dari URL dan mengubahnya menjadi base64 secara aman.
 * Ini mencegah error 404 dari Replicate Delivery jika URL asli sudah dihapus.
 * Juga mendukung pembacaan file lokal dari penyimpanan VPS.
 */
async function fetchImageAsBase64(url: string): Promise<string> {
    if (url.startsWith('data:')) return url; // Sudah base64

    // v12.4: Handle local VPS storage proxy URLs
    if (url.startsWith('/api/storage/view/')) {
        try {
            const relativePath = url.split('/api/storage/view/')[1];
            const absolutePath = path.join(process.cwd(), 'public', relativePath);
            const data = await fs.readFile(absolutePath);
            const ext = path.extname(absolutePath).substring(1) || 'png';
            return `data:image/${ext};base64,${data.toString('base64')}`;
        } catch (e) {
            console.error("[API] Error reading local file for base64:", e);
            throw new Error("Gagal membaca file lokal untuk AI.");
        }
    }
    
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Gagal mengambil gambar (HTTP ${res.statusCode})`));
            }
            const data: Buffer[] = [];
            res.on('data', (chunk) => data.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(data);
                const base64 = buffer.toString('base64');
                const contentType = res.headers['content-type'] || 'image/png';
                resolve(`data:${contentType};base64,${base64}`);
            });
        }).on('error', reject);
    });
}


async function runReplicateModel(owner: string, name: string, input: any, token: string) {
    console.log(`[Replicate] Starting named model: ${owner}/${name}`);
    const { status, data: initData } = await httpsRequest(
        `https://api.replicate.com/v1/models/${owner}/${name}/predictions`,
        {
            method: "POST",
            headers: {
                "Authorization": `Token ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ input })
        }
    );
    
    // v12.2 Enhanced Error Check
    if (status >= 400 || !initData || !initData.urls) {
        const errMsg = initData?.detail || initData?.error || (typeof initData === 'string' ? initData : JSON.stringify(initData));
        console.error(`[Replicate] Failed to start model ${owner}/${name}:`, initData);
        throw new Error(`Replicate Error (${status}): ${errMsg}`);
    }
    
    let predictionUrl = initData.urls.get;
    console.log(`[Replicate] Model started. Status: ${status}, Prediction ID: ${initData.id}`);
    
    while (true) {
        const { data: pollData } = await httpsRequest(predictionUrl, {
            headers: { "Authorization": `Token ${token}` }
        });
        if (pollData.status === "succeeded") return pollData.output;
        if (pollData.status === "failed") throw new Error(pollData.error || pollData.detail || "Replicate prediction failed");
        await new Promise(r => setTimeout(r, 1500));
    }
}

async function runReplicate(version: string, input: any, token: string) {
    console.log(`[Replicate] Starting version-based prediction: ${version.substring(0,8)}...`);
    const { status, data: initData } = await httpsRequest(
        "https://api.replicate.com/v1/predictions",
        {
            method: "POST",
            headers: {
                "Authorization": `Token ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ version, input })
        }
    );

    if (status >= 400 || !initData || !initData.urls) {
        const errMsg = initData?.detail || initData?.error || (typeof initData === 'string' ? initData : JSON.stringify(initData));
        console.error(`[Replicate] Failed to start version ${version.substring(0,8)}...:`, initData);
        throw new Error(`Replicate Error (${status}): ${errMsg}`);
    }
    
    let predictionUrl = initData.urls.get;
    console.log(`[Replicate] Version prediction started. Status: ${status}, Prediction ID: ${initData.id}`);
    
    while (true) {
        const { data: pollData } = await httpsRequest(predictionUrl, {
            headers: { "Authorization": `Token ${token}` }
        });
        if (pollData.status === "succeeded") return pollData.output;
        if (pollData.status === "failed") throw new Error(pollData.error || pollData.detail || "Replicate prediction failed");
        await new Promise(r => setTimeout(r, 1500));
    }
}

async function runOpenAI(prompt: string, key: string) {
    const { data } = await httpsRequest(
        "https://api.openai.com/v1/images/generations",
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "dall-e-3",
                prompt,
                n: 1,
                size: "1024x1024",
                response_format: "url"
            })
        }
    );
    if (data.error) throw new Error(data.error.message);
    return data.data[0].url;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { action, prompt, mode, artStyle, imageUrl } = body;
        
        const replicateToken = process.env.REPLICATE_API_TOKEN;
        const openaiKey = process.env.OPENAI_API_KEY;
        const adminPin = process.env.ADMIN_PIN;
        const requestedPin = req.headers.get("x-admin-pin");

        // --- SISTEM KEAMANAN PIN RAHASIA (MANDATORY) ---
        if (!adminPin) {
            return NextResponse.json({ 
                error: "KESALAHAN KONFIGURASI VPS: Anda belum memasukkan 'ADMIN_PIN' di file .env.local pada server VPS Anda. Mohon isi PIN dan restart PM2." 
            }, { status: 500 });
        }

        if (requestedPin !== adminPin) {
            return NextResponse.json({ 
                error: "AKSES DITOLAK: PIN Administrator salah atau sesi Anda telah berakhir. Silakan Logout dan Login kembali." 
            }, { status: 401 });
        }

        if (!replicateToken) {
            return NextResponse.json({ error: "Replicate Token belum disetting" }, { status: 500 });
        }

        if (action === "verify_pin") {
            return NextResponse.json({ success: true, message: "PIN Valid" });
        }

        if (action === "generate_image") {
            const enhancedPrompt = `A flawless, miniature, perfectly centered die-cut sticker of ${prompt}. Art Style: ${artStyle}. Masterpiece, Ultra HD, premium commercial vector graphic, completely flat 2D colors.
CRITICAL REQUIREMENTS DO NOT IGNORE:
1. SINGLE FIGURE ONLY: Generating sticker sheets, panels, or multiple characters is STRICTLY FORBIDDEN. Draw exactly ONE isolated cohesive object.
2. HUGE ZOOM-OUT PADDING: The single object MUST be drawn relatively SMALL exactly in the center of the canvas. You absolutely MUST leave a massive, massive amount of completely empty black space on all four sides (top, bottom, left, right). Do NOT fill the frame! It is completely unacceptable if any part of the sticker or its outline touches the edge of the screen.
3. OUTLINE: The subject MUST be wrapped in a thick, crisp, solid pure white contour border.
4. BACKGROUND: The background MUST be PURE SOLID BLACK (#000000). Do not use any other colors for the background.
5. NO EFFECTS: Strictly NO drop shadows, NO outer glows, NO colored vignettes, NO 3D shading, and NO gradients.`;
            
            let rawImageUrl = "";

            if (mode === "premium") {
                if (!openaiKey) throw new Error("OPENAI_API_KEY belum disetting di .env.local");
                rawImageUrl = await runOpenAI(enhancedPrompt, openaiKey);
            } else if (mode === "artistic") {
                const fluxOutput = await runReplicateModel("black-forest-labs", "flux-schnell", { prompt: enhancedPrompt }, replicateToken);
                rawImageUrl = Array.isArray(fluxOutput) ? fluxOutput[0] : fluxOutput;
            } else {
                rawImageUrl = await runReplicate(
                   "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b", 
                   { prompt: enhancedPrompt }, 
                   replicateToken
                );
                rawImageUrl = Array.isArray(rawImageUrl) ? rawImageUrl[0] : rawImageUrl;
            }

            return NextResponse.json({ imageUrl: rawImageUrl });
        } 
        
        else if (action === "remove_bg") {
            const { rembgModel } = body;
            const payloadSize = imageUrl ? Math.round(imageUrl.length / 1024) : 0;
            console.log(`[API] Action: remove_bg, Model: ${rembgModel}, Payload Size: ${payloadSize} KB`);
            
            // v12.4: Ensure source is fetched locally (supports Replicate + local VPS storage)
            let finalImageSource = imageUrl;
            if (imageUrl.includes('replicate.delivery') || imageUrl.includes('/api/storage/view/')) {
                try {
                    finalImageSource = await fetchImageAsBase64(imageUrl);
                } catch (e) {
                    console.warn("[API] Failsafe: could not fetch as base64, using original URL");
                }
            }

            // Standard (Original) vs Smart (InSPyReNet)
            const rembgModelVersion = rembgModel === 'smart' 
                ? "a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc"
                : "fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003";

            const transparentImageUrl = await runReplicate(
                rembgModelVersion,
                { image: finalImageSource },
                replicateToken
            );
            return NextResponse.json({ imageUrl: transparentImageUrl });
        }

        else if (action === "generate_vector") {
            const { prompt, stylePrefix, isPro } = body;
            if (!prompt) return NextResponse.json({ error: "Prompt is required" }, { status: 400 });

            // Recraft V4 SVG Models on Replicate
            const modelName = isPro 
                ? "recraft-v4-pro-svg" 
                : "recraft-v4-svg";

            // V4 is prompt-driven, so we bake the style into the prompt
            const finalPrompt = stylePrefix ? `${stylePrefix} ${prompt}` : prompt;

            const output = await runReplicateModel(
                "recraft-ai",
                modelName,
                {
                    prompt: finalPrompt,
                    aspect_ratio: "1:1"
                },
                replicateToken
            );

            // Replicate returns a URI string for these models
            return NextResponse.json({ imageUrl: output });
        }

        else if (action === "upscale") {
            console.log(`[API] Action: upscale, URL: ${imageUrl?.substring(0, 50)}...`);
            
            // v12.4: Ensure source is fetched locally (supports Replicate + local VPS storage)
            let finalImageSource = imageUrl;
            if (imageUrl.includes('replicate.delivery') || imageUrl.includes('/api/storage/view/')) {
                try {
                    finalImageSource = await fetchImageAsBase64(imageUrl);
                } catch (e) {
                    console.warn("[API] Failsafe: could not fetch as base64, using original URL");
                }
            }

            // v12.2: Corrected identifier 'nightmareai' (no hyphen) and latest stable hash
            const upscaledUrl = await runReplicateModel(
                "nightmareai",
                "real-esrgan",
                { image: finalImageSource, scale: 4, face_enhance: false },
                replicateToken
            );
            return NextResponse.json({ imageUrl: upscaledUrl });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    } catch (error: any) {
        console.error("API Error:", error);
        return NextResponse.json({ error: error.message || "Gagal memproses ke server AI" }, { status: 500 });
    }
}
