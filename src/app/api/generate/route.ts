import { NextResponse } from "next/server";

export const maxDuration = 60; // Max duration for Vercel

async function runReplicateModel(owner: string, name: string, input: any, token: string) {
    const initRes = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}/predictions`, {
        method: "POST",
        headers: {
            "Authorization": `Token ${token}`,
            "Content-Type": "application/json",
            // Menghapus 'Prefer: wait' untuk mencegah ETIMEDOUT di VPS
        },
        body: JSON.stringify({ input })
    });
    const initData = await initRes.json();
    if (initData.error) throw new Error(initData.error);
    
    let predictionUrl = initData.urls.get;
    console.log(`[Replicate] Start Model: ${owner}/${name}, URL: ${predictionUrl}`);
    while (true) {
        const pollRes = await fetch(predictionUrl, { headers: { "Authorization": `Token ${token}` } });
        const pollData = await pollRes.json();
        if (pollData.status === "succeeded") return pollData.output;
        if (pollData.status === "failed") throw new Error(pollData.error || "Replicate prediction failed");
        await new Promise(r => setTimeout(r, 1000));
    }
}

async function runReplicate(version: string, input: any, token: string) {
    const initRes = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
            "Authorization": `Token ${token}`,
            "Content-Type": "application/json",
            // Menghapus 'Prefer: wait' untuk mencegah ETIMEDOUT di VPS
        },
        body: JSON.stringify({ version, input })
    });
    const initData = await initRes.json();
    if (initData.error) throw new Error(initData.error);
    
    let predictionUrl = initData.urls.get;
    console.log(`[Replicate] Start Version: ${version.substring(0,8)}..., URL: ${predictionUrl}`);
    while (true) {
        const pollRes = await fetch(predictionUrl, { headers: { "Authorization": `Token ${token}` } });
        const pollData = await pollRes.json();
        if (pollData.status === "succeeded") return pollData.output;
        if (pollData.status === "failed") throw new Error(pollData.error || "Replicate prediction failed");
        await new Promise(r => setTimeout(r, 1000));
    }
}

async function runOpenAI(prompt: string, key: string) {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "dall-e-3",
            prompt,
            n: 1,
            size: "1024x1024",
            response_format: "url"
        })
    });
    
    const data = await response.json();
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
            // Jika eksekusi berhasil mencapai baris ini, berarti blok Security Check "x-admin-pin" di atas sudah lolos. (PIN Cocok!) 
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
            const payloadSize = imageUrl ? Math.round(imageUrl.length / 1024) : 0;
            console.log(`[API] Action: remove_bg, Payload Size: ${payloadSize} KB`);
            
            const rembgModelVersion = "fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003";
            const transparentImageUrl = await runReplicate(
                rembgModelVersion,
                { image: imageUrl },
                replicateToken
            );
            return NextResponse.json({ imageUrl: transparentImageUrl });
        }

        else if (action === "upscale") {
            // Menggunakan AI Upscaler Real-ESRGAN (nightmareai) untuk menajamkan resolusi gambar 4x Lipat (4K)
            const esrganModelVersion = "42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b";
            const upscaledImageUrl = await runReplicate(
                esrganModelVersion,
                { image: imageUrl, scale: 4, face_enhance: false },
                replicateToken
            );
            return NextResponse.json({ imageUrl: upscaledImageUrl });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    } catch (error: any) {
        console.error("API Error:", error);
        return NextResponse.json({ error: error.message || "Gagal memproses ke server AI" }, { status: 500 });
    }
}
