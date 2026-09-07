import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';
import { inspectEmpaquesTiff } from '../src/lib/empaques/tiff.server';
import {
  calculateEmpaquesArte,
  EMPAQUES_TIFF_MAX_BYTES,
  EMPAQUES_TIFF_MAX_PIXELS,
} from '../src/lib/empaques/personalizados-shared';

const asset = readFile(new URL('../public/logo-imprima-horizontal.png', import.meta.url));
const areasReales = [
  { alto_cm: 15, ancho_cm: 12.5 },
  { alto_cm: 21, ancho_cm: 13 },
  { alto_cm: 28, ancho_cm: 14.8 },
  { alto_cm: 20, ancho_cm: 16 },
  { alto_cm: 21, ancho_cm: 19 },
  { alto_cm: 33, ancho_cm: 33 },
];

async function fixture(options: sharp.TiffOptions = {}, width = 900) {
  return sharp(await asset).resize({ width }).tiff({ compression: 'lzw', ...options }).toBuffer();
}

function classicDirectories(buffer: Buffer) {
  assert.equal(buffer.toString('ascii', 0, 2), 'II');
  assert.equal(buffer.readUInt16LE(2), 42);
  const directories: { offset: number; entries: number[]; next: number }[] = [];
  let offset = buffer.readUInt32LE(4);
  while (offset !== 0) {
    assert.ok(directories.length < 32);
    const count = buffer.readUInt16LE(offset);
    const entries = Array.from({ length: count }, (_, index) => offset + 2 + index * 12);
    const next = offset + 2 + count * 12;
    directories.push({ offset, entries, next });
    offset = buffer.readUInt32LE(next);
  }
  return directories;
}

function classicField(buffer: Buffer, tag: number, directory = 0) {
  const entry = classicDirectories(buffer)[directory].entries.find((position) => buffer.readUInt16LE(position) === tag);
  assert.notEqual(entry, undefined, `No se encontró la etiqueta TIFF ${tag}.`);
  return entry!;
}

function setClassicScalar(buffer: Buffer, tag: number, value: number, directory = 0) {
  const entry = classicField(buffer, tag, directory);
  assert.equal(buffer.readUInt32LE(entry + 4), 1);
  const type = buffer.readUInt16LE(entry + 2);
  assert.ok(type === 3 || type === 4);
  if (type === 3 && value <= 65_535) buffer.writeUInt16LE(value, entry + 8);
  else {
    buffer.writeUInt16LE(4, entry + 2);
    buffer.writeUInt32LE(value, entry + 8);
  }
}

function bigEndianCopy(source: Buffer) {
  assert.equal(source.toString('ascii', 0, 2), 'II');
  const output = Buffer.from(source);
  const version = source.readUInt16LE(2);
  const big = version === 43;
  const countSize = big ? 8 : 2;
  const offsetSize = big ? 8 : 4;
  const entrySize = big ? 20 : 12;
  const read = (offset: number, size: number) => size === 8
    ? Number(source.readBigUInt64LE(offset)) : source.readUIntLE(offset, size);
  const write = (offset: number, size: number, value: number) => size === 8
    ? output.writeBigUInt64BE(BigInt(value), offset) : output.writeUIntBE(value, offset, size);
  output.write('MM', 0, 'ascii');
  output.writeUInt16BE(version, 2);
  if (big) {
    output.writeUInt16BE(8, 4);
    output.writeUInt16BE(0, 6);
  }
  const offset = read(big ? 8 : 4, offsetSize);
  write(big ? 8 : 4, offsetSize, offset);
  const count = read(offset, countSize);
  write(offset, countSize, count);
  const typeSizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4, 16: 8, 17: 8, 18: 8 };
  const swapped = new Set<string>();
  for (let index = 0; index < count; index++) {
    const entry = offset + countSize + index * entrySize;
    const tag = read(entry, 2);
    const type = read(entry + 2, 2);
    const items = read(entry + 4, big ? 8 : 4);
    const size = typeSizes[type];
    assert.ok(size);
    assert.ok(![330, 34665, 34853].includes(tag));
    write(entry, 2, tag);
    write(entry + 2, 2, type);
    write(entry + 4, big ? 8 : 4, items);
    const valuePosition = entry + (big ? 12 : 8);
    const bytes = items * size;
    const dataOffset = bytes <= offsetSize ? valuePosition : read(valuePosition, offsetSize);
    if (bytes > offsetSize) write(valuePosition, offsetSize, dataOffset);
    const key = `${dataOffset}:${bytes}`;
    if (size > 1 && !swapped.has(key)) {
      const data = output.subarray(dataOffset, dataOffset + bytes);
      const unitSize = type === 5 || type === 10 ? 4 : size;
      if (unitSize === 2) data.swap16();
      if (unitSize === 4) data.swap32();
      if (unitSize === 8) data.swap64();
      swapped.add(key);
    }
  }
  const next = offset + countSize + count * entrySize;
  assert.equal(read(next, offsetSize), 0);
  write(next, offsetSize, 0);
  return output;
}

function pyramidAsSubifds(source: Buffer) {
  const directories = classicDirectories(source);
  assert.ok(directories.length > 1);
  const childOffsets = directories.slice(1).map(({ offset }) => offset);
  const entries = directories[0].entries.map((offset) => Buffer.from(source.subarray(offset, offset + 12)));
  const newRoot = source.length + source.length % 2;
  const arrayOffset = newRoot + 2 + (entries.length + 1) * 12 + 4;
  const subifd = Buffer.alloc(12);
  subifd.writeUInt16LE(330, 0);
  subifd.writeUInt16LE(4, 2);
  subifd.writeUInt32LE(childOffsets.length, 4);
  subifd.writeUInt32LE(childOffsets.length === 1 ? childOffsets[0] : arrayOffset, 8);
  entries.push(subifd);
  entries.sort((left, right) => left.readUInt16LE(0) - right.readUInt16LE(0));
  const output = Buffer.alloc(arrayOffset + childOffsets.length * 4);
  source.copy(output);
  output.writeUInt32LE(newRoot, 4);
  output.writeUInt16LE(entries.length, newRoot);
  entries.forEach((entry, index) => entry.copy(output, newRoot + 2 + index * 12));
  childOffsets.forEach((offset, index) => output.writeUInt32LE(offset, arrayOffset + index * 4));
  directories.forEach(({ next }) => output.writeUInt32LE(0, next));
  return output;
}

for (const referencia of areasReales) {
  test(`ajusta sin estirar dentro del área real ${referencia.ancho_cm} × ${referencia.alto_cm} cm`, () => {
    const width = Math.round(referencia.ancho_cm * 100);
    const height = Math.round(referencia.alto_cm * 100);
    const exact = calculateEmpaquesArte(width, height, referencia);
    assert.equal(exact.ancho_impresion_cm, referencia.ancho_cm);
    assert.equal(exact.alto_impresion_cm, referencia.alto_cm);
    assert.equal(exact.proporcion_diferente, false);
    assert.ok(Math.abs(exact.ppp_efectivos - 254) <= 0.01);
    assert.equal(exact.resolucion_recomendada, false);
    const contained = calculateEmpaquesArte(width / 2, height, referencia);
    assert.equal(contained.ancho_impresion_cm, referencia.ancho_cm / 2);
    assert.equal(contained.alto_impresion_cm, referencia.alto_cm);
    assert.equal(contained.proporcion_diferente, true);
    assert.equal(contained.ppp_efectivos, exact.ppp_efectivos);
  });

  test(`aplica 150 ppp mínimos y 300 recomendados al área real ${referencia.ancho_cm} × ${referencia.alto_cm} cm`, () => {
    const pixels = (ppp: number, round: (value: number) => number) => [
      round(referencia.ancho_cm * ppp / 2.54),
      round(referencia.alto_cm * ppp / 2.54),
    ] as const;
    assert.throws(() => calculateEmpaquesArte(...pixels(150, Math.floor), referencia), /150 ppp/);
    const minimum = calculateEmpaquesArte(...pixels(150, Math.ceil), referencia);
    assert.ok(minimum.ppp_efectivos >= 150);
    assert.equal(minimum.resolucion_recomendada, false);
    assert.equal(calculateEmpaquesArte(...pixels(300, Math.floor), referencia).resolucion_recomendada, false);
    const recommended = calculateEmpaquesArte(...pixels(300, Math.ceil), referencia);
    assert.ok(recommended.ppp_efectivos >= 300);
    assert.equal(recommended.resolucion_recomendada, true);
  });
}

test('decodifica el logo real convertido localmente a TIFF RGB sin modificarlo y calcula SHA-256', async () => {
  const original = await fixture();
  const before = Buffer.from(original);
  const metadata = await sharp(original).metadata();
  assert.equal(metadata.space, 'srgb');
  const referencia = areasReales[0];
  const result = await inspectEmpaquesTiff(original, referencia);
  const preview = await sharp(result.preview).metadata();
  assert.equal(preview.format, 'png');
  assert.equal(preview.space, 'srgb');
  assert.equal(preview.width, metadata.width);
  assert.equal(preview.height, metadata.height);
  assert.deepEqual(result.validacion, calculateEmpaquesArte(metadata.width, metadata.height, referencia));
  assert.equal(result.sha256, createHash('sha256').update(before).digest('hex'));
  assert.deepEqual(original, before);
});

test('limita la vista previa a 1600 px sin estirar la proporción del asset', async () => {
  const original = await fixture({}, 1800);
  const metadata = await sharp(original).metadata();
  const { preview, validacion } = await inspectEmpaquesTiff(original, areasReales[0]);
  const output = await sharp(preview).metadata();
  assert.equal(output.width, 1600);
  assert.ok(output.height <= 1600);
  assert.ok(Math.abs(output.height - metadata.height * 1600 / metadata.width) <= 1);
  assert.equal(validacion.ancho_px, metadata.width);
  assert.equal(validacion.alto_px, metadata.height);
});

for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
  test(`auto-orienta ${orientation}, valida los ejes correctos y elimina metadatos privados`, async () => {
    const original = await sharp(await asset).resize({ width: 900 })
      .withMetadata({ orientation })
      .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:source="public/logo-imprima-horizontal.png"/></rdf:RDF></x:xmpmeta>')
      .tiff({ compression: 'lzw' }).toBuffer();
    const metadata = await sharp(original).metadata();
    assert.ok(metadata.xmp?.length);
    assert.equal(metadata.orientation, orientation);
    const swap = orientation >= 5;
    const width = swap ? metadata.height : metadata.width;
    const height = swap ? metadata.width : metadata.height;
    const { preview, validacion } = await inspectEmpaquesTiff(original, areasReales[0]);
    const output = await sharp(preview).metadata();
    assert.equal(validacion.ancho_px, width);
    assert.equal(validacion.alto_px, height);
    assert.equal(output.width, width);
    assert.equal(output.height, height);
    for (const field of ['orientation', 'exif', 'xmp', 'iptc', 'tifftagPhotoshop', 'icc'] as const) {
      assert.equal(output[field], undefined);
    }
    const expected = await sharp(original).autoOrient().withIccProfile('srgb', { attach: false }).toColourspace('srgb').raw().toBuffer();
    assert.deepEqual(await sharp(preview).raw().toBuffer(), expected);
  });
}

for (const bigtiff of [false, true]) {
  for (const bigEndian of [false, true]) {
    test(`acepta ${bigtiff ? 'BigTIFF' : 'TIFF clásico'} ${bigEndian ? 'MM' : 'II'} derivado del asset`, async () => {
      const encoded = await fixture({ bigtiff });
      const original = bigEndian ? bigEndianCopy(encoded) : encoded;
      const metadata = await sharp(original).metadata();
      assert.equal(metadata.format, 'tiff');
      const { preview } = await inspectEmpaquesTiff(original, areasReales[0]);
      assert.equal((await sharp(preview).metadata()).format, 'png');
    });
  }
}

test('convierte un perfil CMYK a sRGB solo en la vista previa', async () => {
  const original = await sharp(await asset).resize({ width: 900 }).removeAlpha()
    .withIccProfile('cmyk').toColourspace('cmyk').tiff({ compression: 'lzw' }).toBuffer();
  const metadata = await sharp(original).metadata();
  assert.equal(metadata.space, 'cmyk');
  assert.ok(metadata.icc?.length);
  const digest = createHash('sha256').update(original).digest('hex');
  const { preview, sha256 } = await inspectEmpaquesTiff(original, areasReales[0]);
  assert.equal((await sharp(preview).metadata()).space, 'srgb');
  assert.equal(sha256, digest);
  assert.equal((await sharp(original).metadata()).space, 'cmyk');
});

test('la etiqueta DPI no permite aprobar un asset sin suficientes píxeles', async () => {
  const original = await sharp(await asset).resize({ width: 600 })
    .withMetadata({ density: 1200 }).tiff({ compression: 'lzw', xres: 1200 / 25.4, yres: 1200 / 25.4 }).toBuffer();
  const metadata = await sharp(original).metadata();
  assert.equal(metadata.density, 1200);
  await assert.rejects(inspectEmpaquesTiff(original, areasReales[0]), /150 ppp/);
});

test('rechaza un TIFF multipágina construido con dos copias del asset real', async () => {
  const input = await fixture();
  const original = await sharp([input, input], { join: { animated: true } }).tiff({ compression: 'lzw' }).toBuffer();
  assert.equal((await sharp(original).metadata()).pages, 2);
  await assert.rejects(inspectEmpaquesTiff(original, areasReales[0]), /una sola página/);
});

for (const subifds of [false, true]) {
  test(`una pirámide ${subifds ? 'SubIFD' : 'IFD'} del asset no representa varias caras`, async () => {
    const encoded = await fixture({ pyramid: true, tile: true, tileWidth: 128, tileHeight: 128 }, 1800);
    const original = subifds ? pyramidAsSubifds(encoded) : encoded;
    const metadata = await sharp(original).metadata();
    assert.ok(subifds ? (metadata.subifds ?? 0) > 0 : (metadata.pages ?? 1) > 1);
    const { validacion, preview } = await inspectEmpaquesTiff(original, areasReales[0]);
    assert.equal(validacion.ancho_px, metadata.width);
    assert.equal(validacion.alto_px, metadata.height);
    assert.equal((await sharp(preview).metadata()).width, 1600);
  });
}

test('rechaza subimágenes de pirámide que no se declaran reducciones', async () => {
  const original = await fixture({ pyramid: true, tile: true, tileWidth: 128, tileHeight: 128 }, 1800);
  setClassicScalar(original, 254, 0, 1);
  await assert.rejects(inspectEmpaquesTiff(pyramidAsSubifds(original), areasReales[0]), /una sola página/);
});

test('rechaza bytes vacíos, firmas inválidas y el PNG original aunque sea una imagen válida', async () => {
  const referencia = areasReales[0];
  for (const bytes of [Buffer.alloc(0), Buffer.from('no es un TIFF'), Buffer.from('49492a00', 'hex'), await asset]) {
    await assert.rejects(inspectEmpaquesTiff(bytes, referencia), /TIFF/);
  }
});

test('rechaza archivos mayores de 100 MiB antes de decodificar', async () => {
  await assert.rejects(
    inspectEmpaquesTiff(Buffer.alloc(EMPAQUES_TIFF_MAX_BYTES + 1), areasReales[0]),
    /100 MiB/,
  );
});

test('rechaza truncamiento de cabecera, IFD y bloques del TIFF derivado', async () => {
  const original = await fixture();
  const referencia = areasReales[0];
  const directory = classicDirectories(original)[0];
  for (const length of [4, directory.offset + 1, directory.next + 3]) {
    await assert.rejects(inspectEmpaquesTiff(original.subarray(0, length), referencia), /incompleto|dañado/);
  }
  const invalidBlock = Buffer.from(original);
  const offsetsEntry = classicField(invalidBlock, 273);
  const count = invalidBlock.readUInt32LE(offsetsEntry + 4);
  const dataOffset = count === 1 ? offsetsEntry + 8 : invalidBlock.readUInt32LE(offsetsEntry + 8);
  invalidBlock.writeUInt32LE(invalidBlock.length - 1, dataOffset);
  await assert.rejects(inspectEmpaquesTiff(invalidBlock, referencia), /incompleto|dañado/);
});

test('rechaza datos comprimidos corruptos aunque el IFD siga siendo válido', async () => {
  const original = await fixture();
  const entry = classicField(original, 273);
  const count = original.readUInt32LE(entry + 4);
  const offsets = count === 1 ? entry + 8 : original.readUInt32LE(entry + 8);
  const firstBlock = original.readUInt32LE(offsets);
  original.fill(0xff, firstBlock, firstBlock + 32);
  await assert.rejects(inspectEmpaquesTiff(original, areasReales[0]), {
    message: 'No se pudo decodificar el TIFF. Puede estar dañado, incompleto o superar el límite de procesamiento de 15 segundos.',
  });
});

test('rechaza bombas de píxeles desde el IFD antes de descomprimir', async () => {
  const original = await fixture();
  setClassicScalar(original, 256, EMPAQUES_TIFF_MAX_PIXELS);
  await assert.rejects(inspectEmpaquesTiff(original, areasReales[0]), /límite de píxeles/);
});

test('acota canales y memoria descomprimida antes de cargar el TIFF en sharp', async () => {
  const manyChannels = await fixture();
  setClassicScalar(manyChannels, 277, 100);
  await assert.rejects(inspectEmpaquesTiff(manyChannels, areasReales[0]), /incompleto|dañado/);
  const memoryBomb = await fixture();
  setClassicScalar(memoryBomb, 256, 8000);
  setClassicScalar(memoryBomb, 257, 8000);
  const bits = classicField(memoryBomb, 258);
  const count = memoryBomb.readUInt32LE(bits + 4);
  const position = count * 2 <= 4 ? bits + 8 : memoryBomb.readUInt32LE(bits + 8);
  for (let index = 0; index < count; index++) memoryBomb.writeUInt16LE(16, position + index * 2);
  await assert.rejects(inspectEmpaquesTiff(memoryBomb, areasReales[0]), /memoria/);
});

test('rechaza ciclos de IFD y cantidades de entradas excesivas de forma acotada', async () => {
  const original = await fixture();
  const referencia = areasReales[0];
  const directory = classicDirectories(original)[0];
  const cycle = Buffer.from(original);
  cycle.writeUInt32LE(directory.offset, directory.next);
  await assert.rejects(inspectEmpaquesTiff(cycle, referencia), /incompleto|dañado/);
  const excessive = Buffer.from(original);
  excessive.writeUInt16LE(513, directory.offset);
  await assert.rejects(inspectEmpaquesTiff(excessive, referencia), /límite de directorios/);
});

test('rechaza offsets y cabeceras BigTIFF inválidos sin filtrar errores nativos', async () => {
  const original = await fixture({ bigtiff: true });
  const referencia = areasReales[0];
  const invalidOffset = Buffer.from(original);
  invalidOffset.writeBigUInt64LE(BigInt('18446744073709551615'), 8);
  await assert.rejects(inspectEmpaquesTiff(invalidOffset, referencia), /incompleto|dañado/);
  const invalidHeader = Buffer.from(original);
  invalidHeader.writeUInt16LE(4, 4);
  await assert.rejects(inspectEmpaquesTiff(invalidHeader, referencia), /incompleto|dañado/);
});
