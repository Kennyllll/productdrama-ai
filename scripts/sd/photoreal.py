# 本地写实化（不上传）：SDXL（RealVisXL V5）img2img + ControlNet Union（Blender 深度 + 布景线稿）。
# 深度和线稿锁住墙、墙基、地面线和透视，AI 只改材质和光感。用法：python photoreal.py spec.json
import json, os, sys, time
import cv2, numpy as np, torch
from PIL import Image
from diffusers import AutoencoderKL, ControlNetUnionModel, DPMSolverMultistepScheduler, StableDiffusionXLControlNetUnionImg2ImgPipeline
from huggingface_hub import snapshot_download

S = json.load(open(sys.argv[1]))
dt = {"fp16": torch.float16, "bf16": torch.bfloat16, "fp32": torch.float32}[S.get("dtype", "fp16")]
dev = "mps" if torch.backends.mps.is_available() else "cpu"

# promax 权重文件名不是 diffusers 默认名：建一个标准命名的本地目录
cn_src = snapshot_download("xinsir/controlnet-union-sdxl-1.0", allow_patterns=["config_promax.json", "diffusion_pytorch_model_promax.safetensors"])
cn_dir = os.path.expanduser("~/pd-tools/cn-union-promax")
os.makedirs(cn_dir, exist_ok=True)
for a, b in (("config_promax.json", "config.json"), ("diffusion_pytorch_model_promax.safetensors", "diffusion_pytorch_model.safetensors")):
    if not os.path.exists(os.path.join(cn_dir, b)): os.symlink(os.path.join(cn_src, a), os.path.join(cn_dir, b))

t0 = time.time()
cn = ControlNetUnionModel.from_pretrained(cn_dir, torch_dtype=dt)
vae = AutoencoderKL.from_pretrained("madebyollin/sdxl-vae-fp16-fix", torch_dtype=dt)
pipe = StableDiffusionXLControlNetUnionImg2ImgPipeline.from_pretrained("SG161222/RealVisXL_V5.0", controlnet=cn, vae=vae, torch_dtype=dt, variant="fp16")
if S.get("slicing", False): pipe.enable_attention_slicing()
pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True)
pipe.to(dev)
print("load_s", round(time.time() - t0), flush=True)

plate = Image.open(S["plate"]).convert("RGB")
W = S.get("width", 1536)
H = int(round(W * plate.height / plate.width / 8)) * 8
plate = plate.resize((W, H), Image.LANCZOS)
# Blender 深度按全场归一化，近处一片白、墙基看不清：按 1–99 分位拉开对比
d = np.asarray(Image.open(S["depth"]).convert("L").resize((W, H), Image.BICUBIC), dtype=np.float32)
lo, hi = np.percentile(d, 1), np.percentile(d, 99)
d = np.clip((d - lo) / max(1.0, hi - lo), 0, 1) * 255
depth = Image.fromarray(d.astype(np.uint8)).convert("RGB")
depth.save(S["out"].rsplit(".", 1)[0] + "-depth.png")
g = cv2.cvtColor(np.array(plate), cv2.COLOR_RGB2GRAY)
canny = Image.fromarray(cv2.cvtColor(cv2.Canny(g, S.get("canny_lo", 60), S.get("canny_hi", 150)), cv2.COLOR_GRAY2RGB))
canny.save(S["out"].rsplit(".", 1)[0] + "-canny.png")

# CLIP 一次只读 77 个 token，长提示词后半段（布景细节）会被静默截掉：用 compel 分段编码再拼接
from compel import Compel, ReturnedEmbeddingsType
cp = Compel(tokenizer=[pipe.tokenizer, pipe.tokenizer_2], text_encoder=[pipe.text_encoder, pipe.text_encoder_2],
            returned_embeddings_type=ReturnedEmbeddingsType.PENULTIMATE_HIDDEN_STATES_NON_NORMALIZED,
            requires_pooled=[False, True], truncate_long_prompts=False)
with torch.no_grad():
    pe, pp = cp(S["prompt"])
    ne, np_ = cp(S.get("negative", ""))
    pe, ne = cp.pad_conditioning_tensors_to_same_length([pe, ne])

t0 = time.time()
lat = pipe(
    prompt_embeds=pe, pooled_prompt_embeds=pp, negative_prompt_embeds=ne, negative_pooled_prompt_embeds=np_,
    image=plate, control_image=[depth, canny], control_mode=[1, 3],
    strength=S.get("strength", 0.6), num_inference_steps=S.get("steps", 28),
    guidance_scale=S.get("cfg", 5.0), controlnet_conditioning_scale=S.get("cn_scale", 0.8),
    control_guidance_end=S.get("cn_end", 1.0),
    generator=torch.Generator("cpu").manual_seed(S.get("seed", 7)), height=H, width=W, output_type="latent",
).images
print("latent_nan", bool(torch.isnan(lat).any()), "gen_s", round(time.time() - t0), flush=True)
if torch.isnan(lat).any(): sys.exit("去噪结果是 NaN（MPS 半精度溢出）")
# VAE 用 fp32 解码：MPS 上半精度解码会溢出成全黑
vae.to(dtype=torch.float32)
with torch.no_grad():
    x = vae.decode(lat.to(torch.float32) / vae.config.scaling_factor).sample
img = pipe.image_processor.postprocess(x, output_type="pil")[0]
img.save(S["out"])
print("gen_s", round(time.time() - t0), "PHOTOREAL_OK", S["out"], flush=True)
