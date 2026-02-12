const DEFAULT_MAX_BYTES = 512 * 1024; // 500 KB

export class ScrollbackBuffer {
  private chunks: string[] = [];
  private byteSize = 0;
  private readonly maxBytes: number;

  constructor(maxBytes = DEFAULT_MAX_BYTES) {
    this.maxBytes = maxBytes;
  }

  append(data: string): void {
    const dataBytes = Buffer.byteLength(data, "utf8");
    this.chunks.push(data);
    this.byteSize += dataBytes;

    // Trim from the front while over budget
    while (this.byteSize > this.maxBytes && this.chunks.length > 1) {
      const removed = this.chunks.shift()!;
      this.byteSize -= Buffer.byteLength(removed, "utf8");
    }
  }

  getContents(): string {
    return this.chunks.join("");
  }

  clear(): void {
    this.chunks = [];
    this.byteSize = 0;
  }

  getByteSize(): number {
    return this.byteSize;
  }
}
