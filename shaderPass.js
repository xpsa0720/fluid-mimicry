import { UniformManager } from "./uniformManager.js";

export class ShaderPass {
    constructor(
        gl,
        quadVao,
        isCanvasOutput,
        vertexShaderSource,
        fragmentShaderSource,
        relationTexture,
        uniformCandidate = [],
        textureCandidate = [],
    ) {
        /** @type {WebGL2RenderingContext} */
        this.gl = gl;
        this.quadVao = quadVao;
        this.isCanvasOutput = isCanvasOutput ?? false;
        this.relationTexture = relationTexture;

        this.outputLocations =
            this.parseFragmentOutputLocations(fragmentShaderSource);

        this.colorList = this.createDrawBuffersFromLocations(
            this.outputLocations,
        );

        this.init(
            vertexShaderSource,
            fragmentShaderSource,
            uniformCandidate,
            textureCandidate,
        );
    }

    parseFragmentOutputLocations(fragmentShaderSource) {
        const regex =
            /layout\s*\(\s*location\s*=\s*(\d+)\s*\)\s*out\s+(?:lowp|mediump|highp)?\s*\w+\s+\w+\s*;/g;

        const locations = [];
        let match;

        while ((match = regex.exec(fragmentShaderSource)) !== null) {
            locations.push(Number(match[1]));
        }

        return locations;
    }

    createDrawBuffersFromLocations(locations) {
        const gl = this.gl;

        if (locations.length === 0) {
            return [];
        }

        const maxLocation = Math.max(...locations);
        const buffers = new Array(maxLocation + 1).fill(gl.NONE);

        for (const location of locations) {
            buffers[location] = gl.COLOR_ATTACHMENT0 + location;
        }

        return buffers;
    }

    init(
        vertexShaderSource,
        fragmentShaderSource,
        uniformCandidate,
        textureCandidate,
    ) {
        const gl = this.gl;

        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vertexShaderSource);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(vs));
        }
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fragmentShaderSource);
        gl.compileShader(fs);

        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(fs));
        }

        this.program = gl.createProgram();

        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);

        gl.linkProgram(this.program);
        gl.useProgram(this.program);

        this.uniformManager = new UniformManager(this.gl, this.program);

        uniformCandidate.map((e, i) => {
            this.uniformManager.addUniform(e.key, e.name, e.value);
        });

        textureCandidate.map((e, i) => {
            this.uniformManager.addTextureLocation(e);
        });
    }

    updateUniform(updateUniformDatas) {
        updateUniformDatas.map((e, i) => {
            this.uniformManager.editUniformValue(e.key, e.name, e.value);
        });
    }

    bindFrameBuffer(frameBuffer) {
        const gl = this.gl;
        const COLOR_LIST = [];

        if (this.isCanvasOutput) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.drawBuffers([gl.BACK]);
            return;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer.frameBuffer);
        gl.drawBuffers(this.colorList);
    }

    bindTexture(frameBuffer) {
        const gl = this.gl;

        Object.keys(this.uniformManager.textureLocationList).forEach(
            (key, i) => {
                const t = frameBuffer.texture[key];
                const textureLoc = this.uniformManager.textureLocationList[key];
                gl.activeTexture(gl.TEXTURE0 + i);
                gl.bindTexture(gl.TEXTURE_2D, t);
                gl.uniform1i(textureLoc, i);
            },
        );
    }

    pass(
        updateUniformDatas,
        frameBuffer_A,
        frameBuffer_B,
        textureWidth,
        textureHeight,
    ) {
        const gl = this.gl;

        gl.useProgram(this.program);

        gl.viewport(0, 0, textureWidth, textureHeight);

        this.bindFrameBuffer(frameBuffer_B);

        this.updateUniform(updateUniformDatas ?? []);
        this.uniformManager.deliver();

        this.bindTexture(frameBuffer_A);

        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.bindVertexArray(this.quadVao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}
