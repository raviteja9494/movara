export interface EncodedEelinkCommand {
  payload: Buffer;
  sequence: number;
  serverFlag: number;
}

export class EelinkCommandEncoder {
  private nextSequenceValue = 1;
  private nextServerFlagValue = 1;

  encodeCommand(content: string): EncodedEelinkCommand {
    const sequence = this.nextSequence();
    const serverFlag = this.nextServerFlag();
    const contentBuffer = Buffer.from(content, 'utf8');
    const payload = Buffer.alloc(7 + 1 + 4 + contentBuffer.length);
    payload[0] = 0x67;
    payload[1] = 0x67;
    payload[2] = 0x80;
    payload.writeUInt16BE(2 + 1 + 4 + contentBuffer.length, 3);
    payload.writeUInt16BE(sequence, 5);
    payload[7] = 0x01;
    payload.writeUInt32BE(serverFlag, 8);
    contentBuffer.copy(payload, 12);
    return { payload, sequence, serverFlag };
  }

  private nextSequence(): number {
    const value = this.nextSequenceValue;
    this.nextSequenceValue = value >= 0xffff ? 1 : value + 1;
    return value;
  }

  private nextServerFlag(): number {
    const value = this.nextServerFlagValue;
    this.nextServerFlagValue = value >= 0x7fffffff ? 1 : value + 1;
    return value;
  }
}
