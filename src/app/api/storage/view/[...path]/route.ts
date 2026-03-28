import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    // path is the array of catch-all segments, e.g., ["outputs", "gen", "file.png"]
    const filePathSegments = params.path;
    
    // Security: Only allow access within the outputs directory
    if (filePathSegments[0] !== 'outputs') {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const relativePath = path.join(...filePathSegments);
    const absolutePath = path.join(process.cwd(), 'public', relativePath);

    // Get file extension for Content-Type
    const ext = path.extname(absolutePath).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.svg') contentType = 'image/svg+xml';
    else if (ext === '.webp') contentType = 'image/webp';

    const fileBuffer = await fs.readFile(absolutePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('File serving error:', error);
    return new NextResponse('Not Found', { status: 404 });
  }
}
