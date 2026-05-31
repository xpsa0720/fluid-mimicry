export class Pointer {
    constructor(x, y) {
        this.x = x ?? 0;
        this.y = y ?? 0;
    }

    add(p) {
        this.x += p.x;
        this.y += p.y;
        return this;
    }
    subtract(p) {
        this.x -= p.x;
        this.y -= p.y;
        return this;
    }

    multiply(p) {
        this.x *= p;
        this.y *= p;
        return this;
    }

    clone() {
        return new Pointer(this.x, this.y);
    }
}
