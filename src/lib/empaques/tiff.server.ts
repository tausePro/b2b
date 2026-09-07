import 'server-only';

import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  calculateEmpaquesArte,
  EMPAQUES_TIFF_MAX_BYTES,
  EMPAQUES_TIFF_MAX_PIXELS,
  type EmpaquesArteValidacion,
  type EmpaquesReferencia,
} from './personalizados-shared';

const MAX_IFDS = 32;
const MAX_IFD_ENTRIES = 512;
const MAX_TOTAL_IFD_ENTRIES = 4096;
const MAX_TOTAL_BLOCKS = 65_536;
const SHARP_TIMEOUT_SECONDS = 15;
const PREVIEW_MAX_PX = 1600;
const INVALID_TIFF = 'El archivo TIFF está incompleto, dañado o tiene una estructura no compatible.';
const MULTIPLE_FACES = 'Sube un TIFF de una sola página por cada cara del empaque.';
const IFD_LIMIT = 'El TIFF excede el límite de directorios o bloques de imagen permitidos.';
const INVALID_DIMENSIONS = 'Las dimensiones del TIFF no son válidas o exceden el límite de píxeles.';
const DECODE_ERROR = 'No se pudo decodificar el TIFF. Puede estar dañado, incompleto o superar el límite de procesamiento de 15 segundos.';
const TYPE_BYTES: Readonly<Record<number, number>> = {
  1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4, 16: 8, 17: 8, 18: 8,
};

type TiffField = { type: number; count: number; offset: number; size: number };

function inspectDirectories(buffer: Buffer) {
  const littleEndian = buffer[0] === 0x49 && buffer[1] === 0x49;
  const bigEndian = buffer[0] === 0x4d && buffer[1] === 0x4d;
  if (buffer.length < 8 || (!littleEndian && !bigEndian)) throw new Error(INVALID_TIFF);

  const checkRange = (offset: number, length: number) => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length)
      || offset < 0 || length < 0 || offset > buffer.length - length) throw new Error(INVALID_TIFF);
  };
  const uint = (offset: number, size: number): number => {
    checkRange(offset, size);
    if (size === 2) return littleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
    if (size === 4) return littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
    if (size === 8) {
      const value = littleEndian ? buffer.readBigUInt64LE(offset) : buffer.readBigUInt64BE(offset);
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(INVALID_TIFF);
      return Number(value);
    }
    throw new Error(INVALID_TIFF);
  };

  const version = uint(2, 2);
  if (version !== 42 && version !== 43) throw new Error(INVALID_TIFF);
  const bigTiff = version === 43;
  const offsetSize = bigTiff ? 8 : 4;
  const countSize = bigTiff ? 8 : 2;
  const entrySize = bigTiff ? 20 : 12;
  const headerSize = bigTiff ? 16 : 8;
  if (bigTiff && (uint(4, 2) !== 8 || uint(6, 2) !== 0)) throw new Error(INVALID_TIFF);
  const firstIfd = uint(bigTiff ? 8 : 4, offsetSize);
  const queue = [{ offset: firstIfd, image: true, topLevel: true }];
  const visited = new Set<number>();
  let totalEntries = 0;
  let totalBlocks = 0;
  let pages = 0;
  let subifds = 0;
  let width = 0;
  let height = 0;
  let orientation = 1;

  for (let index = 0; index < queue.length; index++) {
    if (queue.length > MAX_IFDS) throw new Error(IFD_LIMIT);
    const directory = queue[index];
    if (directory.offset < headerSize || visited.has(directory.offset)) throw new Error(INVALID_TIFF);
    visited.add(directory.offset);
    const count = uint(directory.offset, countSize);
    totalEntries += count;
    if (count > MAX_IFD_ENTRIES || totalEntries > MAX_TOTAL_IFD_ENTRIES) throw new Error(IFD_LIMIT);
    const start = directory.offset + countSize;
    checkRange(start, count * entrySize + offsetSize);
    const fields = new Map<number, TiffField>();

    for (let entry = 0; entry < count; entry++) {
      const position = start + entry * entrySize;
      const tag = uint(position, 2);
      const type = uint(position + 2, 2);
      const fieldCount = uint(position + 4, bigTiff ? 8 : 4);
      const size = TYPE_BYTES[type];
      if (!size || fields.has(tag)) throw new Error(INVALID_TIFF);
      const bytes = fieldCount * size;
      const valuePosition = position + (bigTiff ? 12 : 8);
      const offset = bytes <= offsetSize ? valuePosition : uint(valuePosition, offsetSize);
      checkRange(offset, bytes);
      fields.set(tag, { type, count: fieldCount, offset, size });
    }

    const value = (field: TiffField, item = 0) => {
      if (![3, 4, 13, 16, 18].includes(field.type) || item >= field.count) throw new Error(INVALID_TIFF);
      return uint(field.offset + item * field.size, field.size);
    };
    const scalar = (tag: number, fallback = 0) => {
      const field = fields.get(tag);
      if (!field) return fallback;
      if (field.count !== 1) throw new Error(INVALID_TIFF);
      return value(field);
    };

    if (directory.image) {
      const imageWidth = scalar(256);
      const imageHeight = scalar(257);
      if (imageWidth < 1 || imageHeight < 1 || imageWidth * imageHeight > EMPAQUES_TIFF_MAX_PIXELS) {
        throw new Error(INVALID_DIMENSIONS);
      }
      const samples = scalar(277, 1);
      const bitsField = fields.get(258);
      if (samples < 1 || samples > 5 || (bitsField && bitsField.count !== 1 && bitsField.count !== samples)) throw new Error(INVALID_TIFF);
      const bits = bitsField ? Array.from({ length: bitsField.count }, (_, item) => value(bitsField, item)) : [1];
      if (bits.some((bit) => ![1, 2, 4, 8, 16].includes(bit))
        || imageWidth * imageHeight * samples * Math.max(...bits) / 8 > 256 * 1024 * 1024) {
        throw new Error('El TIFF supera el límite de canales, profundidad o memoria de imagen decodificada.');
      }
      const imageOrientation = scalar(274, 1);
      if (imageOrientation < 1 || imageOrientation > 8) throw new Error(INVALID_TIFF);
      const pageNumber = fields.get(297);
      if (pageNumber && (pageNumber.count !== 2 || value(pageNumber) > 0 || value(pageNumber, 1) > 1)) {
        throw new Error(MULTIPLE_FACES);
      }
      if (index === 0) {
        width = imageWidth;
        height = imageHeight;
        orientation = imageOrientation;
      } else {
        const subfileType = scalar(254);
        const reduced = (subfileType & 1) === 1 || scalar(255) === 2;
        if (!reduced || (subfileType & 6) !== 0 || imageWidth > width || imageHeight > height
          || (imageWidth === width && imageHeight === height)) throw new Error(MULTIPLE_FACES);
      }
      if (directory.topLevel) pages++;

      for (const [offsetTag, lengthTag] of [[273, 279], [324, 325]]) {
        const offsets = fields.get(offsetTag);
        const lengths = fields.get(lengthTag);
        if (!offsets && !lengths) continue;
        if (!offsets || !lengths || offsets.count !== lengths.count || offsets.count === 0) throw new Error(INVALID_TIFF);
        totalBlocks += offsets.count;
        if (totalBlocks > MAX_TOTAL_BLOCKS) throw new Error(IFD_LIMIT);
        for (let block = 0; block < offsets.count; block++) {
          checkRange(value(offsets, block), value(lengths, block));
        }
      }
    }

    const nextIfd = uint(start + count * entrySize, offsetSize);
    if (nextIfd !== 0) queue.push({ ...directory, offset: nextIfd });
    for (const tag of [330, 34665, 34853, 40965]) {
      const field = fields.get(tag);
      if (!field) continue;
      if (queue.length + field.count > MAX_IFDS) throw new Error(IFD_LIMIT);
      if (index === 0 && tag === 330) subifds = field.count;
      for (let child = 0; child < field.count; child++) {
        queue.push({ offset: value(field, child), image: tag === 330, topLevel: false });
      }
    }
  }

  return { width, height, orientation, pages, subifds };
}

export async function inspectEmpaquesTiff(
  buffer: Buffer,
  referencia: Pick<EmpaquesReferencia, 'alto_cm' | 'ancho_cm'>,
): Promise<{ preview: Buffer; validacion: EmpaquesArteValidacion; sha256: string }> {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Selecciona un archivo TIFF válido.');
  if (buffer.length > EMPAQUES_TIFF_MAX_BYTES) throw new Error('El TIFF no puede superar 100 MiB.');
  const directories = inspectDirectories(buffer);
  const image = sharp(buffer, {
    failOn: 'warning',
    limitInputPixels: EMPAQUES_TIFF_MAX_PIXELS,
    unlimited: false,
    sequentialRead: true,
    page: 0,
    pages: 1,
    tiff: { subifd: -1 },
  }).timeout({ seconds: SHARP_TIMEOUT_SECONDS });

  try {
    let metadata: sharp.Metadata;
    try {
      metadata = await image.metadata();
    } catch {
      throw new Error(DECODE_ERROR);
    }
    if (metadata.format !== 'tiff') throw new Error('El archivo debe ser un TIFF compatible.');
    if ((metadata.pages ?? 1) !== directories.pages || (metadata.subifds ?? 0) !== directories.subifds) {
      throw new Error(MULTIPLE_FACES);
    }
    if (metadata.width !== directories.width || metadata.height !== directories.height
      || (metadata.orientation ?? 1) !== directories.orientation) throw new Error(INVALID_DIMENSIONS);
    const swapAxes = directories.orientation >= 5 && directories.orientation <= 8;
    const validacion = calculateEmpaquesArte(
      swapAxes ? metadata.height : metadata.width,
      swapAxes ? metadata.width : metadata.height,
      referencia,
    );
    let preview: Buffer;
    try {
      preview = await image
        .autoOrient()
        .resize({ width: PREVIEW_MAX_PX, height: PREVIEW_MAX_PX, fit: 'inside', withoutEnlargement: true })
        .withIccProfile('srgb', { attach: false })
        .toColourspace('srgb')
        .png()
        .toBuffer();
    } catch {
      throw new Error(DECODE_ERROR);
    }
    return { preview, validacion, sha256: createHash('sha256').update(buffer).digest('hex') };
  } finally {
    image.destroy();
  }
}
