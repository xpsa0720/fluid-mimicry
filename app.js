import { Pointer } from "./pointer.js";
import { ShaderPass } from "./shaderPass.js";
import { Uniform } from "./uniform.js";
import { UniformManager } from "./uniformManager.js";
import { uniformSchema } from "./uniformSchema.js";

class App {
    constructor() {
        this.canvas = document.createElement("canvas");
        this.gl = this.canvas.getContext("webgl2");
        document.body.appendChild(this.canvas);

        this.pixelRatio = window.devicePixelRatio > 1 ? 2 : 1;

        this.pointerCoord = new Pointer();
        this.prevPointerCoord = new Pointer();
        this.mouseDelta = new Pointer();
        this.isClick = false;

        window.addEventListener("resize", this.resize.bind(this));

        this.resize();
        this.initWebgl();
        this.initEvent();
    }

    initEvent() {
        window.addEventListener("pointermove", (e) => this.mouseMove(e));
        window.addEventListener("pointerdown", (e) => this.mouseDown(e));
        window.addEventListener("pointerup", (e) => this.mouseUp(e));
    }
    mouseMove(e) {
        this.prevPointerCoord.x = this.pointerCoord.x;
        this.prevPointerCoord.y = this.pointerCoord.y;

        this.pointerCoord.x = (e.clientX * this.pixelRatio) / this.canvas.width;
        this.pointerCoord.y =
            1.0 - (e.clientY * this.pixelRatio) / this.canvas.height;

        const deltaX = this.pointerCoord.x - this.prevPointerCoord.x;
        const deltaY = this.pointerCoord.y - this.prevPointerCoord.y;

        this.mouseDelta.x += deltaX;
        this.mouseDelta.y += deltaY;
    }
    mouseDown(e) {
        this.isClick = true;
    }
    mouseUp(e) {
        this.isClick = false;
    }
    resize() {
        const gl = this.gl;

        this.stageWidth = document.body.clientWidth;
        this.stageHeight = document.body.clientHeight;

        this.canvas.width = this.stageWidth * this.pixelRatio;
        this.canvas.height = this.stageHeight * this.pixelRatio;

        this.canvas.style.width = `${this.stageWidth}px`;
        this.canvas.style.height = `${this.stageHeight}px`;

        if (this.readBuffer || this.writeBuffer) {
            this.readBuffer = this.createFramebuffer();
            this.writeBuffer = this.createFramebuffer();
            this.initTexture();
        }
    }

    vertexShader() {
        return /*glsl*/ `#version 300 es
            layout(location = 0) in vec2 p;
            void main() {
                vec2 pos = p;
                gl_Position = vec4(pos, 0.0, 1.0);
            }
        `;
    }

    initShaderSource() {
        return /*glsl*/ `#version 300 es
            precision highp float;

            layout(location=0) out vec4 outDye;
            layout(location=1) out vec4 outVelocity;
            layout(location=2) out vec4 outDivergence;
            layout(location=3) out vec4 outPressure;

            void main() {
                outDye = vec4(0,0,0,1);
                outVelocity = vec4(0.,0.,0,1);
                outDivergence = vec4(0.,0.,0,1);
                outPressure = vec4(0.,0.,0,1);
                return;
            }
            `;
    }

    splatShaderSource() {
        return /*glsl*/ `#version 300 es
            precision highp float;

            uniform vec2 u_resolution;
            uniform sampler2D u_dyeTexture;
            uniform sampler2D u_velocityTexture;

            uniform float u_penSize;
            uniform bool u_isClick;
            uniform vec2 u_mouse;
            uniform vec3 u_color;

            uniform vec2 u_mouseVelocity;

            layout(location=0) out vec4 outDye;
            layout(location=1) out vec4 outVelocity;

            void main() {
                vec2 coord = gl_FragCoord.xy / u_resolution.xy;
                ivec2 texelCoord = ivec2(gl_FragCoord.xy);
                ivec2 texelMouse = ivec2(u_mouse.xy * u_resolution.xy);
                
                float radius = u_penSize * 0.5;
                float penVecDistance = distance(vec2(texelCoord), vec2(texelMouse));
                bool isInterectionCoord = u_isClick && penVecDistance < radius;

                float d = distance(vec2(texelCoord), vec2(texelMouse));
                float influence = exp(-(d * d) / (radius * radius));
                vec2 velocity = texelFetch(u_velocityTexture, texelCoord, 0).xy;
                vec3 dye = texture(u_dyeTexture, coord).rgb;

                if(u_isClick){
                    velocity += u_mouseVelocity * influence;
                    dye += u_color * influence;
                }

                outDye = vec4(dye,1);
                outVelocity = vec4(velocity,0,0);

                return;    
            }
            `;
    }
    velocityDisplayShaderSource() {
        return /*glsl*/ `#version 300 es
        precision highp float;

        uniform vec2 u_resolution;
        uniform sampler2D u_velocityTexture;

        layout(location=0) out vec4 outColor;

        void main() {
            vec2 coord = gl_FragCoord.xy / u_resolution.xy;

            vec2 v = texture(u_velocityTexture, coord).xy;

            vec3 color = vec3(v * 0.5 + 0.5, 0.0);

            outColor = vec4(color, 1.0);
        }
    `;
    }

    divergenceShaderSource() {
        return /*glsl*/ `#version 300 es
            precision highp float;

            uniform vec2 u_resolution;
            uniform sampler2D u_velocityTexture;

            layout(location=2) out vec4 outDivergence;

            void main() {
                ivec2 coord = ivec2(gl_FragCoord.xy);

                float L = texelFetch(u_velocityTexture, coord + ivec2(-1, 0),0).x;
                float R = texelFetch(u_velocityTexture, coord + ivec2(1, 0),0).x;
                float T = texelFetch(u_velocityTexture, coord + ivec2(0, 1),0).y;
                float B = texelFetch(u_velocityTexture, coord + ivec2(0, -1),0).y;

                float divergence = 1. * ((R - L) + (T - B));

                outDivergence = vec4(divergence, 0, 0, 1);
            }
            `;
    }

    pressureInitShaderSource() {
        return /*glsl*/ `#version 300 es
            precision highp float;

            layout(location=3) out vec4 outPressure;

            void main() {
                outPressure = vec4(0, 0, 0, 1);
            }
            `;
    }

    pressureShaderSource() {
        return /*glsl*/ `#version 300 es
            precision highp float;

            uniform vec2 u_resolution;
            uniform sampler2D u_pressureTexture;
            uniform sampler2D u_divergenceTexture;

            layout(location=3) out vec4 outPressure;

            void main() {
                ivec2 coord = ivec2(gl_FragCoord.xy);

                float divergence = texelFetch(u_divergenceTexture, coord, 0).r;

                float L = texelFetch(u_pressureTexture, coord + ivec2(-1, 0),0).x;
                float R = texelFetch(u_pressureTexture, coord + ivec2(1, 0),0).x;
                float T = texelFetch(u_pressureTexture, coord + ivec2(0, -1),0).x;
                float B = texelFetch(u_pressureTexture, coord + ivec2(0, 1),0).x;

                float pressure = (L + R + T + B - divergence) * 0.25;

                outPressure = vec4(pressure, 0, 0, 1);
            }
            `;
    }

    gradientSubtractShaderSource() {
        return /*glsl*/ `#version 300 es
            precision highp float;

            uniform vec2 u_resolution;
            uniform sampler2D u_velocityTexture;
            uniform sampler2D u_pressureTexture;

            layout(location=1) out vec4 outVelocity;

            void main() {
                ivec2 coord = ivec2(gl_FragCoord.xy);
                ivec2 size = textureSize(u_pressureTexture, 0);

                ivec2 Lc = clamp(coord + ivec2(-1, 0), ivec2(0), size - ivec2(1));
                ivec2 Rc = clamp(coord + ivec2(1, 0), ivec2(0), size - ivec2(1));
                ivec2 Tc = clamp(coord + ivec2(0, 1), ivec2(0), size - ivec2(1));
                ivec2 Bc = clamp(coord + ivec2(0, -1), ivec2(0), size - ivec2(1));

                float L = texelFetch(u_pressureTexture, Lc,0).x;
                float R = texelFetch(u_pressureTexture, Rc,0).x;
                float T = texelFetch(u_pressureTexture, Tc,0).x;
                float B = texelFetch(u_pressureTexture, Bc,0).x;

                vec2 velocity = texelFetch(u_velocityTexture, coord, 0).xy;

                vec2 gradient = vec2(R-L,T-B)*0.5;

                velocity -= gradient;
                outVelocity = vec4(velocity, 0, 1);
            }
            `;
    }

    dyeAdvectionShaderSource() {
        return /*glsl*/ `#version 300 es
            precision highp float;

            uniform vec2 u_resolution;
            uniform sampler2D u_velocityTexture;
            uniform sampler2D u_dyeTexture;
            uniform float u_dt;

            layout(location=0) out vec4 outDye;

            void main() {
                vec2 coord = gl_FragCoord.xy / u_resolution.xy;

                vec2 currentVelocity = texture(u_velocityTexture, coord).xy;
                vec2 prevCoord = coord - currentVelocity * u_dt;

                vec3 dye = texture(u_dyeTexture, prevCoord).rgb;
                dye -= 0.0018;
                outDye = vec4(dye, 1.);
            }
            `;
    }
    velocityAdvectionShaderSource() {
        return /*glsl*/ `#version 300 es
            precision highp float;

            uniform vec2 u_resolution;
            uniform sampler2D u_velocityTexture;
            uniform sampler2D u_dyeTexture;
            uniform float u_dt;

            layout(location=1) out vec4 outVelocity;

            void main() {
                vec2 coord = gl_FragCoord.xy / u_resolution.xy;

                vec2 currentVelocity = texture(u_velocityTexture, coord).xy;
                vec2 prevCoord = coord - currentVelocity * u_dt;

                vec3 velocity = texture(u_velocityTexture, prevCoord).rgb;
                velocity *=0.999;
                outVelocity = vec4(velocity, 1.);
            }
            `;
    }

    displayShaderSource() {
        return /*glsl*/ `#version 300 es
            precision highp float;

            uniform vec2 u_resolution;
            uniform sampler2D u_dyeTexture;

            layout(location=0) out vec4 outColor;

            void main() {
                vec2 coord = gl_FragCoord.xy / u_resolution.xy;
                vec3 dye = texture(u_dyeTexture, coord).rgb;

                
                outColor = vec4(dye,1);
            }
            `;
    }

    randomColor() {
        const max = 0.08;
        const min = 0;

        const r = Math.random() * (max - min) + min;
        const g = Math.random() * (max - min) + min;
        const b = Math.random() * (max - min) + min;

        return [r, g, b];
    }

    animate() {
        const currentTime = performance.now();
        const [r, g, b] = this.randomColor();

        if (this.prevTime === null) {
            this.prevTime = currentTime;
        }

        const dt = Math.min((currentTime - this.prevTime) / 1000, 1 / 30);
        this.prevTime = currentTime;

        this.splatPass.pass(
            [
                { key: "bool", name: "u_isClick", value: this.isClick },
                {
                    key: "vec2",
                    name: "u_mouse",
                    value: [this.pointerCoord.x, this.pointerCoord.y],
                },
                { key: "vec3", name: "u_color", value: [r, g, b] },
                {
                    key: "vec2",
                    name: "u_mouseVelocity",
                    value: [this.mouseDelta.x * 10, this.mouseDelta.y * 10],
                },
            ],
            this.readBuffer,
            this.writeBuffer,
            this.textureWidth,
            this.textureHeight,
        );

        this.velocityAdvectionPass.pass(
            [{ key: "float", name: "u_dt", value: dt }],
            this.readBuffer,
            this.writeBuffer,
            this.textureWidth,
            this.textureHeight,
        );

        this.divergencePass.pass(
            [],
            this.readBuffer,
            this.writeBuffer,
            this.textureWidth,
            this.textureHeight,
        );

        this.pressureInitPass.pass(
            [],
            this.readBuffer,
            this.writeBuffer,
            this.textureWidth,
            this.textureHeight,
        );

        for (let i = 0; i < 50; i++) {
            this.pressurePass.pass(
                [],
                this.readBuffer,
                this.writeBuffer,
                this.textureWidth,
                this.textureHeight,
            );
        }

        this.gradientSubtractPass.pass(
            [],
            this.readBuffer,
            this.writeBuffer,
            this.textureWidth,
            this.textureHeight,
        );

        this.dyeAdvectionPass.pass(
            [{ key: "float", name: "u_dt", value: dt }],
            this.readBuffer,
            this.writeBuffer,
            this.textureWidth,
            this.textureHeight,
        );

        this.displayPass.pass(
            [],
            this.readBuffer,
            null,
            this.canvas.width,
            this.canvas.height,
        );

        this.mouseDelta.x = 0;
        this.mouseDelta.y = 0;

        requestAnimationFrame(this.animate.bind(this));
    }

    initWebgl() {
        const gl = this.gl;
        const vs = gl.createShader(gl.VERTEX_SHADER);
        this.penSize = 200;
        this.cellRatio = 1;
        this.textureWidth = this.canvas.width / this.cellRatio;
        this.textureHeight = this.canvas.height / this.cellRatio;
        this.prevTime = null;
        this.quadVao = this.createQuadVAO();
        this.relationTexture = {
            u_dyeTexture: gl.COLOR_ATTACHMENT0,
            u_velocityTexture: gl.COLOR_ATTACHMENT1,
            u_divergenceTexture: gl.COLOR_ATTACHMENT2,
            u_pressureTexture: gl.COLOR_ATTACHMENT3,
        };

        const resolution = {
            key: "vec2",
            name: "u_resolution",
            value: [this.textureWidth, this.textureHeight],
        };

        gl.getExtension("EXT_color_buffer_float");
        gl.getExtension("OES_texture_float_linear");

        this.initPass = new ShaderPass(
            gl,
            this.quadVao,
            false,
            this.vertexShader(),
            this.initShaderSource(),
            this.relationTexture,
        );

        this.velocityAdvectionPass = new ShaderPass(
            gl,
            this.quadVao,
            false,
            this.vertexShader(),
            this.velocityAdvectionShaderSource(),
            this.relationTexture,
            [{ key: "float", name: "u_dt", value: 0 }, resolution],
            ["u_velocityTexture"],
            ["u_velocityTexture"],
        );

        this.dyeAdvectionPass = new ShaderPass(
            gl,
            this.quadVao,
            false,
            this.vertexShader(),
            this.dyeAdvectionShaderSource(),
            this.relationTexture,
            [{ key: "float", name: "u_dt", value: 0 }, resolution],
            ["u_dyeTexture", "u_velocityTexture"],
            ["u_dyeTexture"],
        );

        this.divergencePass = new ShaderPass(
            gl,
            this.quadVao,
            false,
            this.vertexShader(),
            this.divergenceShaderSource(),
            this.relationTexture,
            [resolution],
            ["u_velocityTexture"],
            ["u_divergenceTexture"],
        );

        this.pressureInitPass = new ShaderPass(
            gl,
            this.quadVao,
            false,
            this.vertexShader(),
            this.pressureInitShaderSource(),
            this.relationTexture,
            [],
            [],
            [],
        );

        this.pressurePass = new ShaderPass(
            gl,
            this.quadVao,
            false,
            this.vertexShader(),
            this.pressureShaderSource(),
            this.relationTexture,
            [resolution],
            ["u_pressureTexture", "u_divergenceTexture"],
            ["u_pressureTexture"],
        );

        this.gradientSubtractPass = new ShaderPass(
            gl,
            this.quadVao,
            false,
            this.vertexShader(),
            this.gradientSubtractShaderSource(),
            this.relationTexture,
            [resolution],
            ["u_velocityTexture", "u_pressureTexture"],
            ["u_velocityTexture", "u_pressureTexture"],
        );

        this.splatPass = new ShaderPass(
            gl,
            this.quadVao,
            false,
            this.vertexShader(),
            this.splatShaderSource(),
            this.relationTexture,
            [
                resolution,
                { key: "float", name: "u_penSize", value: this.penSize },
                { key: "bool", name: "u_isClick", value: this.isClick },
                {
                    key: "vec2",
                    name: "u_mouse",
                    value: [this.pointerCoord.x, this.pointerCoord.y],
                },
                { key: "vec3", name: "u_color", value: [0, 0, 0] },
                {
                    key: "vec2",
                    name: "u_mouseVelocity",
                    value: [this.mouseDelta.x * 10, this.mouseDelta.y * 10],
                },
            ],
            ["u_dyeTexture", "u_velocityTexture"],
            ["u_dyeTexture", "u_velocityTexture"],
        );
        this.velocityDisplayPass = new ShaderPass(
            gl,
            this.quadVao,
            true,
            this.vertexShader(),
            this.velocityDisplayShaderSource(),
            this.relationTexture,
            [resolution],
            ["u_velocityTexture"],
        );
        this.displayPass = new ShaderPass(
            gl,
            this.quadVao,
            true,
            this.vertexShader(),
            this.displayShaderSource(),
            this.relationTexture,
            [resolution],
            ["u_dyeTexture"],
        );

        this.readBuffer = this.createFramebuffer();
        this.writeBuffer = this.createFramebuffer();

        this.initPass.pass(
            [],
            this.readBuffer,
            this.writeBuffer,
            this.textureWidth,
            this.textureHeight,
        );

        [this.readBuffer, this.writeBuffer] = [
            this.writeBuffer,
            this.readBuffer,
        ];

        this.animate();
    }

    createdyeTexture() {
        const gl = this.gl;
        const texture = gl.createTexture();

        gl.bindTexture(gl.TEXTURE_2D, texture);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            this.textureWidth,
            this.textureHeight,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null,
        );

        return texture;
    }

    createSignedFloatTexture() {
        const gl = this.gl;
        const texture = gl.createTexture();

        gl.bindTexture(gl.TEXTURE_2D, texture);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RG16F,
            this.textureWidth,
            this.textureHeight,
            0,
            gl.RG,
            gl.HALF_FLOAT,
            null,
        );

        return texture;
    }

    createQuadVAO() {
        const gl = this.gl;
        const vao = gl.createVertexArray();

        gl.bindVertexArray(vao);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
            gl.STATIC_DRAW,
        );

        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        return vao;
    }

    createFramebuffer() {
        const gl = this.gl;

        const u_dyeTexture = this.createdyeTexture();
        const u_velocityTexture = this.createSignedFloatTexture();
        const u_divergenceTexture = this.createSignedFloatTexture();
        const u_pressureTexture = this.createSignedFloatTexture();

        const textureList = [
            u_dyeTexture,
            u_velocityTexture,
            u_divergenceTexture,
            u_pressureTexture,
        ];

        const frameBuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);

        textureList.map((e, i) => {
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER,
                gl.COLOR_ATTACHMENT0 + i,
                gl.TEXTURE_2D,
                e,
                0,
            );
        });

        return {
            frameBuffer,
            texture: {
                u_dyeTexture,
                u_velocityTexture,
                u_divergenceTexture,
                u_pressureTexture,
            },
        };
    }
}

window.onload = () => new App();
