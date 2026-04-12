export interface EncodedGt06Command {
  payload: Buffer;
}

export class Gt06CommandEncoder {
  encodeCommand(content: string): EncodedGt06Command {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error('Command content cannot be empty');
    }

    const commandBuffer = Buffer.from(trimmed, 'ascii');
    const languageBytes = 0;
    const length = 1 + 1 + 4 + commandBuffer.length + 2 + 2 + languageBytes;
    const payload = Buffer.alloc(2 + 1 + length + 2);

    payload[0] = 0x78;
    payload[1] = 0x78;
    payload[2] = length;
    payload[3] = 0x80;
    payload[4] = 4 + commandBuffer.length;
    payload.writeUInt32BE(0, 5);
    commandBuffer.copy(payload, 9);
    payload.writeUInt16BE(0, 9 + commandBuffer.length);

    const checksum = this.calculateChecksum(payload.subarray(2, 11 + commandBuffer.length));
    payload.writeUInt16BE(checksum, 11 + commandBuffer.length);
    payload[13 + commandBuffer.length] = 0x0d;
    payload[14 + commandBuffer.length] = 0x0a;

    return { payload };
  }

  private calculateChecksum(data: Buffer): number {
    let crc = 0xffff;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let bit = 0; bit < 8; bit++) {
        crc = (crc & 0x0001) !== 0 ? (crc >> 1) ^ 0x8408 : crc >> 1;
      }
    }
    return (~crc) & 0xffff;
  }
}
