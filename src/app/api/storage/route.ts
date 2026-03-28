import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const PIN_CONFIG = process.env.ADMIN_PIN || "200216";

const validatePin = (req: NextRequest) => {
  const pin = req.headers.get('x-admin-pin');
  return pin === PIN_CONFIG;
};

// POST: Save an image and optionally delete a legacy version
export async function POST(req: NextRequest) {
  if (!validatePin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { imageUrl, category, deleteOldPath } = await req.json();

    if (!imageUrl || !category) {
      return NextResponse.json({ error: "Missing imageUrl or category" }, { status: 400 });
    }

    // 1. Get the image data
    let imageBuffer: Buffer;
    if (imageUrl.startsWith('data:image/')) {
      const base64Data = imageUrl.split(',')[1];
      imageBuffer = Buffer.from(base64Data, 'base64');
    } else {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
      const arrayBuffer = await response.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    }

    // 2. Generate unique filename
    let ext = 'png';
    if (!imageUrl.startsWith('data:image/')) {
        ext = imageUrl.split('.').pop()?.split('?')[0] || 'png';
    }
    const filename = `${category}_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
    const targetDir = path.join(process.cwd(), 'public', 'outputs', category);
    const targetPath = path.join(targetDir, filename);

    // Ensure directory exists
    await fs.mkdir(targetDir, { recursive: true });

    // 3. Save to disk
    await fs.writeFile(targetPath, imageBuffer);

    // 4. Delete old file if provided (with Dual Path Deletion)
    const debugLogs: string[] = [];
    if (deleteOldPath) {
        // Strip proxy prefix if present
        const actualDeletePath = deleteOldPath.includes('/api/storage/view') 
            ? deleteOldPath.split('/api/storage/view')[1] 
            : deleteOldPath;

        if (actualDeletePath.startsWith('/outputs/')) {
            // Aggressive normalization for Linux/VPS paths
            const normalizedPath = actualDeletePath.replace(/^\/+/, ''); // Remove all leading slashes
            const oldFileAbsPath = path.join(process.cwd(), 'public', normalizedPath);
            const altFileAbsPath = path.resolve('./public', normalizedPath);
            
            debugLogs.push(`[STORAGE] Deleting: ${oldFileAbsPath}`);

            try {
                let exists = await fs.access(oldFileAbsPath).then(() => true).catch(() => false);
                let targetDelete = oldFileAbsPath;

                if (!exists) {
                    exists = await fs.access(altFileAbsPath).then(() => true).catch(() => false);
                    targetDelete = altFileAbsPath;
                }

                if (exists) {
                    await fs.unlink(targetDelete);
                    debugLogs.push(`[STORAGE] SUCCESS: Deleted old file at ${targetDelete}`);
                } else {
                    debugLogs.push(`[STORAGE] SKIP: File Not Found at ${oldFileAbsPath} or ${altFileAbsPath}`);
                }
            } catch (e: any) {
                const errMsg = `[STORAGE] FAILED: ${e.code} - ${e.message}`;
                debugLogs.push(errMsg);
                console.error(errMsg);
            }

            // Write to persistent debug log for AI monitoring
            const logEntry = `[${new Date().toISOString()}] Action: SAVE, New: ${filename}, Deleting: ${actualDeletePath}, Status: ${debugLogs.join(' | ')}\n`;
            await fs.appendFile(path.join(process.cwd(), 'public', 'storage-debug.txt'), logEntry).catch(() => {});

            return NextResponse.json({ 
                localUrl: `/outputs/${category}/${filename}`, 
                debug: debugLogs 
            });
        }
    }

    const localUrl = `/outputs/${category}/${filename}`;
    return NextResponse.json({ localUrl });

  } catch (error: any) {
    console.error("Storage API POST Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Explicitly remove a physical file
export async function DELETE(req: NextRequest) {
    if (!validatePin(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  
    try {
      const { filePath } = await req.json();
  
      if (!filePath || !filePath.startsWith('/outputs/')) {
        return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
      }
  
      // Aggressive normalization and Dual Path Deletion
      const normalizedPath = filePath.replace(/^\/+/, ''); 
      const absPath = path.join(process.cwd(), 'public', normalizedPath);
      const altPath = path.resolve('./public', normalizedPath);
  
      try {
        let exists = await fs.access(absPath).then(() => true).catch(() => false);
        let targetDelete = absPath;

        if (!exists) {
            exists = await fs.access(altPath).then(() => true).catch(() => false);
            targetDelete = altPath;
        }

        if (exists) {
          await fs.unlink(targetDelete);
          return NextResponse.json({ success: true, deleted: targetDelete });
        } else {
          return NextResponse.json({ success: true, message: "File not found locally, skipping" });
        }
      } catch (err: any) {
        console.error("FS Unlink Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    } catch (error: any) {
      console.error("Storage DELETE API Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
