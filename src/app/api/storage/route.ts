import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const PIN_CONFIG = process.env.ADMIN_PIN || "200216";

const validatePin = (req: NextRequest) => {
  const pin = req.headers.get('x-admin-pin');
  return pin === PIN_CONFIG;
};

// POST: Save an external image to local directory
export async function POST(req: NextRequest) {
  if (!validatePin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { imageUrl, category, deleteOldPath } = await req.json();

    if (!imageUrl || !category) {
      return NextResponse.json({ error: "Missing imageUrl or category" }, { status: 400 });
    }

    // 1. Download the image
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const buffer = await response.arrayBuffer();

    // 2. Generate unique filename
    const ext = imageUrl.split('.').pop()?.split('?')[0] || 'png';
    const filename = `${category}_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
    const targetDir = path.join(process.cwd(), 'public', 'outputs', category);
    const targetPath = path.join(targetDir, filename);

    // Ensure directory exists (extra safety)
    await fs.mkdir(targetDir, { recursive: true });

    // 3. Save to disk
    await fs.writeFile(targetPath, Buffer.from(buffer));

    // 4. Delete old file if provided (for replacements)
    if (deleteOldPath && deleteOldPath.startsWith('/outputs/')) {
        const oldFileAbsPath = path.join(process.cwd(), 'public', deleteOldPath);
        try {
            await fs.unlink(oldFileAbsPath);
        } catch (e) {
            console.warn(`Failed to delete old file: ${deleteOldPath}`, e);
        }
    }

    const localUrl = `/outputs/${category}/${filename}`;
    return NextResponse.json({ localUrl });

  } catch (error: any) {
    console.error("Storage API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Remove a physical file from VPS
export async function DELETE(req: NextRequest) {
    if (!validatePin(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  
    try {
      const { filePath } = await req.json();
  
      if (!filePath || !filePath.startsWith('/outputs/')) {
        return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
      }
  
      const absPath = path.join(process.cwd(), 'public', filePath);
      
      try {
        await fs.unlink(absPath);
        return NextResponse.json({ success: true });
      } catch (e: any) {
        if (e.code === 'ENOENT') {
            return NextResponse.json({ success: true, message: "File already gone" });
        }
        throw e;
      }
  
    } catch (error: any) {
      console.error("Storage API DELETE Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
