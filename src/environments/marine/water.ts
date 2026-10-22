import * as T from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

export interface WaterVessel { id: string; position: [number, number, number]; yaw: number; length: number }
/** Official Reflector supplies the clipped planar pass; the ocean BRDF is our own shader. */
export function createMarineWater(geometry: T.BufferGeometry = new T.PlaneGeometry(100000, 100000)) {
  const uniforms = {
    tDiffuse: { value: null }, color: { value: new T.Color() }, textureMatrix: { value: new T.Matrix4() },
    time: { value: 0 }, sunDirection: { value: new T.Vector3(-0.5, 0.3, -0.8).normalize() },
    waterColor: { value: new T.Color('#17414a') }, horizonColor: { value: new T.Color('#c1cbcd') },
    surfaceRoughness: { value: 0 }, waveStrength: { value: 1 },
    hdrSky: { value: null }, skyReady: { value: 0 }, skyRotation: { value: 0 },
    wakes: { value: Array.from({ length: 16 }, () => new T.Vector4(0, 0, 0, 0)) },
  };
  const water = new Reflector(geometry, {
    textureWidth: 768, textureHeight: 768, multisample: 0, clipBias: 0.003,
    shader: {
      name: 'MarineOcean', uniforms,
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        uniform mat4 textureMatrix;
        varying vec4 mirrorCoord; varying vec3 world;
        void main(){
          vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;mirrorCoord=textureMatrix*vec4(position,1.);
          gl_Position=projectionMatrix*viewMatrix*p;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        uniform sampler2D tDiffuse; uniform float time; uniform vec3 sunDirection;
        uniform vec3 waterColor; uniform vec3 horizonColor; uniform vec4 wakes[16];
        uniform float surfaceRoughness; uniform float waveStrength;
        uniform sampler2D hdrSky; uniform float skyReady; uniform float skyRotation;
        varying vec4 mirrorCoord; varying vec3 world;
        // Integer lattice hashing avoids driver-dependent sine precision seams.
        float hash(vec2 p){
          uvec2 cell=uvec2(ivec2(p));
          uint h=cell.x*1664525u+cell.y*1013904223u;
          h^=h>>16u;h*=2246822519u;h^=h>>13u;
          return float(h>>8u)/16777215.;
        }
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
        float wave(vec2 p,vec2 d,float f,float speed,float phase){
          float a=dot(p,d)*f+time*speed+phase;
          float band=1.-smoothstep(.35,2.8,fwidth(a));
          return cos(a+noise(p*.13+phase+time*.025)*5.)*band;
        }
        void main(){
          #include <logdepthbuf_fragment>
          vec3 v=normalize(cameraPosition-world);float dist=length(cameraPosition-world);
          vec2 p=world.xz;
          vec2 slope=vec2(0.);
          // Long, non-commensurate wind waves; sub-metre ripples fade with distance.
          slope+=vec2(.86,.50)*wave(p,vec2(.86,.50),1.31,1.1,0.)*.09;
          slope+=vec2(.93,-.36)*wave(p,vec2(.93,-.36),2.17,1.6,1.8)*.055;
          slope+=vec2(.62,.78)*wave(p,vec2(.62,.78),.47,.75,3.2)*.055;
          slope+=vec2(.2,.98)*wave(p,vec2(.2,.98),.83,.9,6.9)*.045;
          slope+=vec2(-.65,.76)*wave(p,vec2(-.65,.76),3.9,1.3,12.6)*.025;
          float close=1.-smoothstep(50.,850.,dist);
          slope+=vec2(-.3,.95)*wave(p,vec2(-.3,.95),9.13,2.6,.3)*.028*close;
          slope+=vec2(.8,.6)*wave(p,vec2(.8,.6),17.3,3.1,2.4)*.018*close;
          slope+=surfaceRoughness*vec2(.92,.39)*wave(p,vec2(.92,.39),.11,.42,4.)*.11;
          slope+=surfaceRoughness*vec2(.74,-.67)*wave(p,vec2(.74,-.67),.19,.63,8.)*.07;
          slope*=waveStrength;
          vec3 n=normalize(vec3(-slope.x,1.,-slope.y));
          vec2 uv=mirrorCoord.xy/mirrorCoord.w+slope*vec2(.045,.075);
          vec2 pixel=vec2(2./768.,4./768.)+surfaceRoughness*vec2(.022,.035);
          vec3 reflected=texture2D(tDiffuse,clamp(uv,vec2(.002),vec2(.998))).rgb*.5;
          reflected+=(texture2D(tDiffuse,clamp(uv+pixel,vec2(.002),vec2(.998))).rgb+texture2D(tDiffuse,clamp(uv-pixel,vec2(.002),vec2(.998))).rgb)*.25;
          // Approximate unresolved wind-wave scattering; the default preserves the sheltered harbour.
          reflected=mix(reflected,mix(waterColor*1.7,horizonColor,.35),surfaceRoughness*.65);
          float fresnel=.035+.965*pow(1.-max(dot(v,n),0.),5.);
          vec3 halfDir=normalize(v+sunDirection);
          float glint=pow(max(dot(n,halfDir),0.),mix(220.,65.,surfaceRoughness))*.8;
          vec3 sea=waterColor*(.68+.2*dot(n,sunDirection));
          vec3 result=mix(sea,reflected,clamp(fresnel*.68+.08,0.,.85))+vec3(1.,.90,.72)*glint;
          float foam=0.;
          for(int i=0;i<16;i++){
            vec4 w=wakes[i];vec2 dp=p-w.xy;
            float c=cos(w.z),s=sin(w.z);
            vec2 local=vec2(dp.x*c-dp.y*s,dp.x*s+dp.y*c);
            float aft=-local.y;
            float mask=smoothstep(0.,.8,aft)*(1.-smoothstep(3.,14.,aft));
            float arm=exp(-pow((abs(local.x)-aft*.24)/.22,2.));
            float streak=exp(-local.x*local.x/.3)*(1.-smoothstep(0.,8.,aft));
            foam+=w.w*mask*(arm*.5+streak*.3)*(.65+.35*sin(aft*12.-time*5.));
          }
          result=mix(result,vec3(.63,.74,.72),clamp(foam,0.,.7));
          // Same distance atmosphere as the shore; a 100 km plane hides its finite edge.
          float fog=smoothstep(1400.,11000.,dist);
          vec2 heading=world.xz-cameraPosition.xz;
          float longitude=atan(heading.y,heading.x)+skyRotation;
          vec3 horizon=skyReady>.5 ? texture2D(hdrSky,vec2(fract(longitude/6.2831853+.5),.501)).rgb*.75 : horizonColor;
          result=mix(result,horizon,fog);
          gl_FragColor=vec4(result,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    },
  });
  water.name = 'water-0'; water.rotation.x = -Math.PI / 2;
  // Waves only distort the cached reflection. Re-render when the camera or scene changes.
  const renderReflection = water.onBeforeRender.bind(water);
  let reflectionDirty = true, lastCamera: number[] = [], lastProjection: number[] = [];
  water.onBeforeRender = (...args) => {
    const camera = args[2];
    const changed = (next: number[], old: number[]) => next.some((n, i) => old[i] === undefined || Math.abs(n - old[i]) > 1e-8);
    if (reflectionDirty || changed(camera.matrixWorld.elements, lastCamera) || changed(camera.projectionMatrix.elements, lastProjection)) {
      renderReflection(...args);
      reflectionDirty = false;
      lastCamera = [...camera.matrixWorld.elements]; lastProjection = [...camera.projectionMatrix.elements];
    }
  };
  const material = water.material as T.ShaderMaterial;
  let vessels: WaterVessel[] = [], disposed = false;
  const history = new Map<string, { position: T.Vector2; strength: number }>();
  return {
    root: water,
    setVessels(value: WaterVessel[]) {
      const next = value.slice(0, 16);
      if (JSON.stringify(next) !== JSON.stringify(vessels)) reflectionDirty = true;
      vessels = next.map(v => ({ ...v, position: [...v.position] }));
    },
    setSun(value: T.Vector3) { material.uniforms.sunDirection.value.copy(value); reflectionDirty = true; },
    setSky(texture: T.Texture) { material.uniforms.hdrSky.value = texture; material.uniforms.skyReady.value = 1; material.uniforms.skyRotation.value = texture.userData.backgroundRotation ?? 0; reflectionDirty = true; },
    invalidateReflection() { reflectionDirty = true; },
    update(dt: number) {
      if (disposed) return;
      material.uniforms.time.value = (material.uniforms.time.value + dt) % 10000;
      const wakeData = material.uniforms.wakes.value as T.Vector4[];
      wakeData.forEach(w => w.w = 0);
      vessels.forEach((v, i) => {
        const position = new T.Vector2(v.position[0], v.position[2]), old = history.get(v.id);
        const distance = old ? old.position.distanceTo(position) : 0;
        const speed = dt > 0 && distance < 10 ? distance / dt : 0;
        const strength = Math.max((old?.strength ?? 0) * Math.exp(-dt * 1.6), Math.min(speed / 4, 1));
        history.set(v.id, { position, strength });
        wakeData[i].set(position.x - Math.sin(v.yaw) * v.length * .4, position.y - Math.cos(v.yaw) * v.length * .4, v.yaw, strength);
      });
      for (const id of history.keys()) if (!vessels.some(v => v.id === id)) history.delete(id);
    },
    dispose() { if (disposed) return; disposed = true; water.dispose(); water.geometry.dispose(); history.clear(); },
  };
}
