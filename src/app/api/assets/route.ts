import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { extractToken, verifyToken } from '@/lib/auth';

type AssetType = 'vrm' | 'bgimage';

const ROOT_ASSET_DIRS: Record<AssetType, string> = {
  vrm: path.resolve(process.cwd(), 'vrm'),
  bgimage: path.resolve(process.cwd(), 'bgimage'),
};

const PUBLIC_ASSET_DIRS: Record<AssetType, string> = {
  vrm: path.resolve(process.cwd(), 'public', 'vrm'),
  bgimage: path.resolve(process.cwd(), 'public', 'bgimage'),
};

const ALLOWED_EXTENSIONS: Record<AssetType, Set<string>> = {
  vrm: new Set(['.vrm']),
  bgimage: new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']),
};

function sanitizeFileName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function resolveAssetType(value: string | null): AssetType | null {
  if (value === 'vrm' || value === 'bgimage') {
    return value;
  }
  return null;
}

async function ensureAuth(req: NextRequest): Promise<NextResponse | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: '認証が必須です' }, { status: 401 });
  }

  const token = extractToken(authHeader);
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
  }

  return null;
}

async function listAssets(type: AssetType) {
  const rootDir = ROOT_ASSET_DIRS[type];
  const publicDir = PUBLIC_ASSET_DIRS[type];
  await Promise.all([
    fs.mkdir(rootDir, { recursive: true }),
    fs.mkdir(publicDir, { recursive: true }),
  ]);

  const allowed = ALLOWED_EXTENSIONS[type];

  const [rootEntries, publicEntries] = await Promise.all([
    fs.readdir(rootDir, { withFileTypes: true }).catch(() => [] as any[]),
    fs.readdir(publicDir, { withFileTypes: true }).catch(() => [] as any[]),
  ]);

  const rootNameSet = new Set(
    rootEntries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
  );
  const publicNameSet = new Set(
    publicEntries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
  );

  const fileNames = new Set<string>();
  for (const entry of [...rootEntries, ...publicEntries]) {
    if (!entry.isFile()) {
      continue;
    }
    const name = entry.name;
    if (!allowed.has(path.extname(name).toLowerCase())) {
      continue;
    }
    fileNames.add(name);
  }

  // 既存データ救済: 片側にしか存在しない場合はもう片側へミラーする
  await Promise.all(
    Array.from(fileNames).map(async (name) => {
      const rootPath = path.join(rootDir, name);
      const publicPath = path.join(publicDir, name);

      const hasRoot = rootNameSet.has(name);
      const hasPublic = publicNameSet.has(name);

      if (hasRoot && !hasPublic) {
        await fs.copyFile(rootPath, publicPath).catch(() => undefined);
      }
      if (!hasRoot && hasPublic) {
        await fs.copyFile(publicPath, rootPath).catch(() => undefined);
      }
    })
  );

  return Array.from(fileNames)
    .sort((a, b) => a.localeCompare(b, 'ja'))
    .map((name) => ({
      name,
      url: `/${type}/${encodeURIComponent(name)}`,
    }));
}

function resolveFileNameFromUrl(type: AssetType, url: string): string | null {
  if (!url.startsWith(`/${type}/`)) {
    return null;
  }

  const encoded = url.slice(`/${type}/`.length);
  if (!encoded) {
    return null;
  }

  const decoded = decodeURIComponent(encoded);
  const safeName = path.basename(decoded);
  if (safeName !== decoded) {
    return null;
  }

  const ext = path.extname(safeName).toLowerCase();
  if (!ALLOWED_EXTENSIONS[type].has(ext)) {
    return null;
  }

  return safeName;
}

export async function GET(req: NextRequest) {
  try {
    const authError = await ensureAuth(req);
    if (authError) {
      return authError;
    }

    const type = resolveAssetType(req.nextUrl.searchParams.get('type'));
    if (!type) {
      return NextResponse.json({ error: 'type は vrm または bgimage を指定してください' }, { status: 400 });
    }

    const files = await listAssets(type);
    return NextResponse.json({ type, files }, { status: 200 });
  } catch (err) {
    console.error('List assets error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authError = await ensureAuth(req);
    if (authError) {
      return authError;
    }

    const formData = await req.formData();
    const type = resolveAssetType(String(formData.get('type') || ''));
    if (!type) {
      return NextResponse.json({ error: 'type は vrm または bgimage を指定してください' }, { status: 400 });
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file が必要です' }, { status: 400 });
    }

    const originalName = sanitizeFileName(file.name || 'upload');
    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXTENSIONS[type].has(ext)) {
      return NextResponse.json({ error: `許可されていない拡張子です: ${ext}` }, { status: 400 });
    }

    const baseName = path.basename(originalName, ext) || type;
    const finalName = `${baseName}_${Date.now()}${ext}`;

    const rootDir = ROOT_ASSET_DIRS[type];
    const publicDir = PUBLIC_ASSET_DIRS[type];
    await Promise.all([
      fs.mkdir(rootDir, { recursive: true }),
      fs.mkdir(publicDir, { recursive: true }),
    ]);

    const buffer = Buffer.from(await file.arrayBuffer());
    await Promise.all([
      fs.writeFile(path.join(rootDir, finalName), buffer),
      fs.writeFile(path.join(publicDir, finalName), buffer),
    ]);

    return NextResponse.json(
      {
        type,
        file: {
          name: finalName,
          url: `/${type}/${encodeURIComponent(finalName)}`,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Upload asset error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authError = await ensureAuth(req);
    if (authError) {
      return authError;
    }

    const body = await req.json().catch(() => null);
    const type = resolveAssetType(typeof body?.type === 'string' ? body.type : null);
    const url = typeof body?.url === 'string' ? body.url : '';

    if (!type || !url) {
      return NextResponse.json({ error: 'type と url が必要です' }, { status: 400 });
    }

    const fileName = resolveFileNameFromUrl(type, url);
    if (!fileName) {
      return NextResponse.json({ error: '削除対象のファイル指定が不正です' }, { status: 400 });
    }

    const rootDir = ROOT_ASSET_DIRS[type];
    const publicDir = PUBLIC_ASSET_DIRS[type];
    const rootTargetPath = path.resolve(rootDir, fileName);
    const publicTargetPath = path.resolve(publicDir, fileName);

    if (!rootTargetPath.startsWith(rootDir) || !publicTargetPath.startsWith(publicDir)) {
      return NextResponse.json({ error: '不正なパスです' }, { status: 400 });
    }

    const results = await Promise.allSettled([
      fs.unlink(rootTargetPath),
      fs.unlink(publicTargetPath),
    ]);

    const removed = results.some((result) => result.status === 'fulfilled');
    if (!removed) {
      return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 404 });
    }

    return NextResponse.json({ success: true, type, url }, { status: 200 });
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 404 });
    }
    console.error('Delete asset error:', err);
    return NextResponse.json({ error: 'サーバーエラー' }, { status: 500 });
  }
}
