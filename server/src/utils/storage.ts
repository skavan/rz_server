import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const WINDOWS_ABS_PATH_RE = /^[A-Za-z]:[\\/]/;

function resolvePathFromCwd(rawPath: string, envVarName: string): string {
  if (process.platform !== 'win32' && WINDOWS_ABS_PATH_RE.test(rawPath)) {
    throw new Error(
      `${envVarName} is set to a Windows-style path (${rawPath}) on ${process.platform}. ` +
      `Set ${envVarName} to a Linux path (for example: /var/lib/rz_server/media or ./uploads).`
    );
  }

  return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
}

const UPLOAD_DIR = resolvePathFromCwd(process.env.UPLOAD_DIR || 'uploads', 'UPLOAD_DIR');

export interface MediaFile {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  relativePath: string;
}

export class MediaStorage {
  private baseDir: string;

  constructor(baseDir: string = UPLOAD_DIR) {
    this.baseDir = baseDir;
  }

  /**
   * Get the full path for an entity's media directory
   */
  getEntityDir(customerId: number, entityType: string, entityId: number): string {
    return path.join(
      this.baseDir,
      'customers',
      String(customerId),
      entityType,
      String(entityId)
    );
  }

  /**
   * Ensure directory exists, create if needed
   */
  async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Generate a unique filename with timestamp
   */
  generateFilename(originalName: string): string {
    const timestamp = Date.now();
    const sanitized = originalName
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return `${timestamp}-${sanitized}`;
  }

  /**
   * Save uploaded file to entity directory
   */
  async save(
    file: Express.Multer.File,
    customerId: number,
    entityType: string,
    entityId: number
  ): Promise<MediaFile> {
    const entityDir = this.getEntityDir(customerId, entityType, entityId);
    await this.ensureDir(entityDir);

    const filename = this.generateFilename(file.originalname);
    const filePath = path.join(entityDir, filename);
    
    await fs.writeFile(filePath, file.buffer);

    const relativePath = path.join(
      'customers',
      String(customerId),
      entityType,
      String(entityId),
      filename
    );

    return {
      filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      relativePath: relativePath.replace(/\\/g, '/'), // Normalize to forward slashes
    };
  }

  /**
   * Delete a file by relative path
   */
  async delete(relativePath: string): Promise<void> {
    const fullPath = path.join(this.baseDir, relativePath);
    try {
      await fs.unlink(fullPath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Get absolute path for serving files
   */
  getAbsolutePath(relativePath: string): string {
    return path.join(this.baseDir, relativePath);
  }

  /**
   * Check if file exists
   */
  async exists(relativePath: string): Promise<boolean> {
    const fullPath = path.join(this.baseDir, relativePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}

export const storage = new MediaStorage();
