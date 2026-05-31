import { Uniform } from "./uniform.js";

export class UniformManager {
    constructor(gl, program) {
        this.gl = gl;
        this.program = program;

        this.list = {
            vec2: [],
            vec3: [],
            int: [],
            float: [],
            bool: [],
        };
        this.textureLocationList = {};
    }

    addUniform(key, name, value) {
        if (!this.list[key]) {
            this.list[key] = [];
        }
        const loc = this.gl.getUniformLocation(this.program, name);
        // if (loc === null) {
        //     throw Error(`uniform을 찾을 수 없음: ${name}`);
        // }

        this.list[key].push(new Uniform(name, loc, value));
    }

    editUniformValue(key, name, value) {
        const uniform = this.list[key].find((e) => e.name === name);
        uniform.value = value;
    }

    getUniformValue(key, name, value) {
        return this.list[key].find((e) => e.name === name).value;
    }

    addTextureLocation(name) {
        const loc = this.gl.getUniformLocation(this.program, name);
        if (loc === null) {
            throw Error(`uniform을 찾을 수 없음: ${name}`);
        }
        this.textureLocationList[name] = loc;
    }

    uniformTypeName(type) {
        const gl = this.gl;
        const UNIFORM_TYPES = {
            [gl.FLOAT]: "float",
            [gl.FLOAT_VEC2]: "vec2",
            [gl.FLOAT_VEC3]: "vec3",
            [gl.FLOAT_VEC4]: "vec4",
            [gl.INT]: "int",
            [gl.INT_VEC2]: "ivec2",
            [gl.BOOL]: "bool",
            [gl.SAMPLER_2D]: "sampler2D",
        };
        return UNIFORM_TYPES[type] ?? `unknown(${type})`;
    }

    printActiveUniforms() {
        const gl = this.gl;
        const count = this.gl.getProgramParameter(
            this.program,
            this.gl.ACTIVE_UNIFORMS,
        );

        for (let i = 0; i < count; i++) {
            const info = this.gl.getActiveUniform(this.program, i);
            console.log(
                `${info.name}: ${this.uniformTypeName(info.type)}, size=${info.size}`,
            );
        }
    }

    deliver() {
        const keys = Object.keys(this.list);

        keys.forEach((type) => {
            const datas = this.list[type];
            switch (type) {
                case "vec2":
                    this.uniform2fvs(datas);
                    break;
                case "vec3":
                    this.uniform3fvs(datas);
                    break;
                case "init":
                    this.uniformbs(datas);
                    break;
                case "int":
                    this.uniform1is(datas);
                    break;
                case "float":
                    this.uniform1fs(datas);
                    break;
                case "bool":
                    this.uniform1bs(datas);
                    break;
            }
        });
    }

    uniform1bs(datas) {
        datas.forEach((e) => {
            this.gl.uniform1i(e.loc, e.value ? 1 : 0);
        });
    }
    uniform1fs(datas) {
        datas.forEach((e, i) => {
            this.gl.uniform1f(e.loc, e.value);
        });
    }

    uniform1is(datas) {
        datas.forEach((e, i) => {
            this.gl.uniform1i(e.loc, e.value);
        });
    }

    uniform2fvs(datas) {
        datas.forEach((e, i) => {
            this.gl.uniform2fv(e.loc, e.value);
        });
    }
    uniform3fvs(datas) {
        datas.forEach((e) => {
            this.gl.uniform3fv(e.loc, e.value);
        });
    }
    uniformbs(datas) {
        datas.forEach((e, i) => {
            this.gl.uniform1i(e.loc, e.value);
        });
    }
}
