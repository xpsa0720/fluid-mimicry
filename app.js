import { Pointer } from "./pointer.js";
import { ShaderPass } from "./shaderPass.js";
import { Uniform } from "./uniform.js";
import { UniformManager } from "./uniformManager.js";
import { uniformSchema } from "./uniformSchema.js";

const DYERES = 2048;
const SIMRES = 128;

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

        // if (this.readBuffer || this.writeBuffer) {
        //     this.readBuffer = this.createFramebuffer();
        //     this.writeBuffer = this.createFramebuffer();
        //     this.initTexture();
        // }
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

    initDyeShaderSource() {
        return /*glsl*/ `#version 300 es
            precision highp float;

            layout(location=0) out vec4 outDye;

            void main() {
                outDye = vec4(0,0,0,1);
                return;
            }
            `;
    }
    initSimShaderSource() {
        return /*glsl*/ `#version 300 es
            precision highp float;

            layout(location=0) out vec4 outVelocity;
            layout(location=1) out vec4 outDivergence;
            layout(location=2) out vec4 outPressure;

            void main() {
                outVelocity = vec4(0.,0.,0,1);
                outDivergence = vec4(0.,0.,0,1);
                outPressure = vec4(0.,0.,0,1);
                return;
            }
            `;
    }
    dyeSplatShaderSource() {
        return /*glsl*/ `#version 300 es
            precision highp float;

            uniform vec2 u_resolution;
            uniform sampler2D u_dyeTexture;

            uniform float u_penSize;
            uniform bool u_isClick;
            uniform vec2 u_mouse;
            uniform vec3 u_color;


            layout(location=0) out vec4 outDye;

            void main() {
                vec2 coord = gl_FragCoord.xy / u_resolution.xy;

                vec2 diff = coord - u_mouse.xy;
                diff.x *= u_resolution.x / u_resolution.y;
                float radius = u_penSize * 0.5;
                float d = length(diff);
                float influence = exp(-(d * d) / (radius * radius));
                vec3 dye = texture(u_dyeTexture, coord).rgb;

                if(u_isClick){
                    dye += u_color * influence;
                }

                outDye = vec4(dye,1);

                return;    
            }
            `;
    }

    velocitySplatShaderSource() {
        return /*glsl*/ `#version 300 es
            precision highp float;

            uniform vec2 u_resolution;
            uniform sampler2D u_velocityTexture;

            uniform float u_penSize;
            uniform bool u_isClick;
            uniform vec2 u_mouse;

            uniform vec2 u_mouseVelocity;

            layout(location=0) out vec4 outVelocity;

            void main() {
                vec2 coord = gl_FragCoord.xy / u_resolution.xy;
                
                vec2 diff = coord - u_mouse.xy;
                diff.x *= u_resolution.x / u_resolution.y;
                float radius = u_penSize * 0.5;
                float d = length(diff);
                float influence = exp(-(d * d) / (radius * radius));

                vec2 velocity = texture(u_velocityTexture, coord).xy;

                if(u_isClick){
                    velocity += u_mouseVelocity * influence;
                }

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

            layout(location=1) out vec4 outDivergence;

            void main() {
                ivec2 coord = ivec2(gl_FragCoord.xy);

                float L = texelFetch(u_velocityTexture, coord + ivec2(-1, 0),0).x;
                float R = texelFetch(u_velocityTexture, coord + ivec2(1, 0),0).x;
                float T = texelFetch(u_velocityTexture, coord + ivec2(0, 1),0).y;
                float B = texelFetch(u_velocityTexture, coord + ivec2(0, -1),0).y;

                float divergence = 0.5 * ((R - L) + (T - B));

                outDivergence = vec4(divergence, 0, 0, 1);
            }
            `;
    }

    pressureInitShaderSource() {
        return /*glsl*/ `#version 300 es
            precision highp float;

            uniform vec2 u_resolution;

            uniform sampler2D u_pressureTexture;

            layout(location=2) out vec4 outPressure;

            void main() {
                vec2 coord = gl_FragCoord.xy / u_resolution.xy;
                float pressure = texture(u_pressureTexture, coord).r * 0.8;
                outPressure = vec4(pressure, 0, 0, 1);
            }
            `;
    }

    pressureShaderSource() {
        return /*glsl*/ `#version 300 es
            precision highp float;

            uniform vec2 u_resolution;
            uniform sampler2D u_pressureTexture;
            uniform sampler2D u_divergenceTexture;

            layout(location=2) out vec4 outPressure;

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

            layout(location=0) out vec4 outVelocity;

            void main() {
                ivec2 texelCoord = ivec2(gl_FragCoord.xy);
                vec2 coord = gl_FragCoord.xy / u_resolution.xy;
                ivec2 size = textureSize(u_pressureTexture, 0);

                ivec2 Lc = clamp(texelCoord + ivec2(-1, 0), ivec2(0), size - ivec2(1));
                ivec2 Rc = clamp(texelCoord + ivec2(1, 0), ivec2(0), size - ivec2(1));
                ivec2 Tc = clamp(texelCoord + ivec2(0, 1), ivec2(0), size - ivec2(1));
                ivec2 Bc = clamp(texelCoord + ivec2(0, -1), ivec2(0), size - ivec2(1));

                float L = texelFetch(u_pressureTexture, Lc,0).x;
                float R = texelFetch(u_pressureTexture, Rc,0).x;
                float T = texelFetch(u_pressureTexture, Tc,0).x;
                float B = texelFetch(u_pressureTexture, Bc,0).x;

                vec2 velocity = texture(u_velocityTexture, coord).xy;

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

                // dye -= 0.0018;
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

            layout(location=0) out vec4 outVelocity;

            void main() {
                vec2 coord = gl_FragCoord.xy / u_resolution.xy;

                vec2 currentVelocity = texture(u_velocityTexture, coord).xy;
                vec2 prevCoord = coord - currentVelocity * u_dt;

                vec3 velocity = texture(u_velocityTexture, prevCoord).rgb;
                velocity *=0.96;
                outVelocity = vec4(velocity, 0.);
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
                // coord.y *= u_resolution.y / u_resolution.x;
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

        // return [r, g, b];
        return [0.07, 0.07, 0.07];
    }

    animate() {
        const currentTime = performance.now();
        const [r, g, b] = this.randomColor();

        if (this.prevTime === null) {
            this.prevTime = currentTime;
        }

        const dt = Math.min((currentTime - this.prevTime) / 1000, 1 / 30);
        this.prevTime = currentTime;

        this.dyeSplatPass.pass(
            [
                { key: "bool", name: "u_isClick", value: this.isClick },
                {
                    key: "vec2",
                    name: "u_mouse",
                    value: [this.pointerCoord.x, this.pointerCoord.y],
                },
                { key: "vec3", name: "u_color", value: [r, g, b] },
            ],
            this.dyeReadBuffer,
            this.dyeWriteBuffer,
            this.dyeTextureWidth,
            this.dyeTextureHeight,
        );

        this.velocitySplatPass.pass(
            [
                { key: "bool", name: "u_isClick", value: this.isClick },
                {
                    key: "vec2",
                    name: "u_mouse",
                    value: [this.pointerCoord.x, this.pointerCoord.y],
                },
                {
                    key: "vec2",
                    name: "u_mouseVelocity",
                    value: [this.mouseDelta.x * 90, this.mouseDelta.y * 90],
                },
            ],
            this.simReadBuffer,
            this.simWriteBuffer,
            this.simTextureWidth,
            this.simTextureHeight,
        );

        this.velocityAdvectionPass.pass(
            [{ key: "float", name: "u_dt", value: dt }],
            this.simReadBuffer,
            this.simWriteBuffer,
            this.simTextureWidth,
            this.simTextureHeight,
        );

        this.divergencePass.pass(
            [],
            this.simReadBuffer,
            this.simWriteBuffer,
            this.simTextureWidth,
            this.simTextureHeight,
        );

        this.pressureInitPass.pass(
            [],
            this.simReadBuffer,
            this.simWriteBuffer,
            this.simTextureWidth,
            this.simTextureHeight,
        );

        for (let i = 0; i < 20; i++) {
            this.pressurePass.pass(
                [],
                this.simReadBuffer,
                this.simWriteBuffer,
                this.simTextureWidth,
                this.simTextureHeight,
            );
        }

        this.gradientSubtractPass.pass(
            [],
            this.simReadBuffer,
            this.simWriteBuffer,
            this.simTextureWidth,
            this.simTextureHeight,
        );

        this.dyeAdvectionPass.pass(
            [{ key: "float", name: "u_dt", value: dt }],
            this.dyeReadBuffer,
            this.dyeWriteBuffer,
            this.dyeTextureWidth,
            this.dyeTextureHeight,
            this.simReadBuffer,
        );

        this.displayPass.pass(
            [],
            this.dyeReadBuffer,
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
        this.penSize = 0.1;
        this.simTextureWidth = SIMRES;
        this.simTextureHeight = Math.floor(
            SIMRES * (this.canvas.height / this.canvas.width),
        );
        this.dyeTextureWidth = DYERES;
        this.dyeTextureHeight = Math.floor(
            DYERES * (this.canvas.height / this.canvas.width),
        );
        this.prevTime = null;
        this.quadVao = this.createQuadVAO();

        this.relationDyeTexture = {
            u_dyeTexture: gl.COLOR_ATTACHMENT0,
        };

        this.relationSimTexture = {
            u_velocityTexture: gl.COLOR_ATTACHMENT0,
            u_divergenceTexture: gl.COLOR_ATTACHMENT1,
            u_pressureTexture: gl.COLOR_ATTACHMENT2,
        };

        const resolution = {
            key: "vec2",
            name: "u_resolution",
            value: [this.simTextureWidth, this.simTextureHeight],
        };

        const dyeResolution = {
            key: "vec2",
            name: "u_resolution",
            value: [this.dyeTextureWidth, this.dyeTextureHeight], // 1024!
        };
        gl.getExtension("EXT_color_buffer_float");
        gl.getExtension("OES_texture_float_linear");

        this.initDyePass = new ShaderPass(
            gl,
            this.quadVao,
            false,
            this.vertexShader(),
            this.initDyeShaderSource(),
            this.relationDyeTexture,
            [],
            [],
            ["u_dyeTexture"],
        );

        this.initSimPass = new ShaderPass(
            gl,
            this.quadVao,
            false,
            this.vertexShader(),
            this.initSimShaderSource(),
            this.relationSimTexture,
        );

        this.velocityAdvectionPass = new ShaderPass(
            gl,
            this.quadVao,
            false,
            this.vertexShader(),
            this.velocityAdvectionShaderSource(),
            this.relationSimTexture,
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
            this.relationDyeTexture,
            [{ key: "float", name: "u_dt", value: 0 }, dyeResolution],
            ["u_dyeTexture", "u_velocityTexture"],
            ["u_dyeTexture"],
        );

        this.divergencePass = new ShaderPass(
            gl,
            this.quadVao,
            false,
            this.vertexShader(),
            this.divergenceShaderSource(),
            this.relationSimTexture,
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
            this.relationSimTexture,
            [resolution],
            ["u_pressureTexture"],
            ["u_pressureTexture"],
        );

        this.pressurePass = new ShaderPass(
            gl,
            this.quadVao,
            false,
            this.vertexShader(),
            this.pressureShaderSource(),
            this.relationSimTexture,
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
            this.relationSimTexture,
            [resolution],
            ["u_velocityTexture", "u_pressureTexture"],
            ["u_velocityTexture", "u_pressureTexture"],
        );

        this.dyeSplatPass = new ShaderPass(
            gl,
            this.quadVao,
            false,
            this.vertexShader(),
            this.dyeSplatShaderSource(),
            this.relationDyeTexture,
            [
                dyeResolution,
                { key: "float", name: "u_penSize", value: this.penSize },
                { key: "bool", name: "u_isClick", value: this.isClick },
                {
                    key: "vec2",
                    name: "u_mouse",
                    value: [this.pointerCoord.x, this.pointerCoord.y],
                },
                { key: "vec3", name: "u_color", value: [0, 0, 0] },
            ],
            ["u_dyeTexture"],
            ["u_dyeTexture"],
        );

        this.velocitySplatPass = new ShaderPass(
            gl,
            this.quadVao,
            false,
            this.vertexShader(),
            this.velocitySplatShaderSource(),
            this.relationSimTexture,
            [
                resolution,
                { key: "float", name: "u_penSize", value: this.penSize },
                { key: "bool", name: "u_isClick", value: this.isClick },
                {
                    key: "vec2",
                    name: "u_mouse",
                    value: [this.pointerCoord.x, this.pointerCoord.y],
                },
                {
                    key: "vec2",
                    name: "u_mouseVelocity",
                    value: [this.mouseDelta.x * 10, this.mouseDelta.y * 10],
                },
            ],
            ["u_velocityTexture"],
            ["u_velocityTexture"],
        );

        this.displayPass = new ShaderPass(
            gl,
            this.quadVao,
            true,
            this.vertexShader(),
            this.displayShaderSource(),
            this.relationDyeTexture,
            [
                {
                    key: "vec2",
                    name: "u_resolution",
                    value: [this.canvas.width, this.canvas.height],
                },
            ],
            ["u_dyeTexture"],
        );

        this.simReadBuffer = this.createSimulationFrameBuffer();
        this.simWriteBuffer = this.createSimulationFrameBuffer();

        this.dyeReadBuffer = this.createDyeFrameBuffer();
        this.dyeWriteBuffer = this.createDyeFrameBuffer();

        this.initDyePass.pass(
            [],
            this.dyeReadBuffer,
            this.dyeWriteBuffer,
            this.dyeTextureWidth,
            this.dyeTextureHeight,
        );

        this.initSimPass.pass(
            [],
            this.simReadBuffer,
            this.simWriteBuffer,
            this.simTextureWidth,
            this.simTextureHeight,
        );

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
            this.dyeTextureWidth,
            this.dyeTextureHeight,
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
            this.simTextureWidth,
            this.simTextureHeight,
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

    createDyeFrameBuffer() {
        const gl = this.gl;

        const u_dyeTexture = this.createdyeTexture();

        const frameBuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);

        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            u_dyeTexture,
            0,
        );

        return {
            frameBuffer,
            texture: {
                u_dyeTexture,
            },
        };
    }
    createSimulationFrameBuffer() {
        const gl = this.gl;

        const u_velocityTexture = this.createSignedFloatTexture();
        const u_divergenceTexture = this.createSignedFloatTexture();
        const u_pressureTexture = this.createSignedFloatTexture();

        const textureList = [
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
                u_velocityTexture,
                u_divergenceTexture,
                u_pressureTexture,
            },
        };
    }
}

window.onload = () => new App();
