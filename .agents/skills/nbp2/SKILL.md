---
name: nbp2
description: |
  帮助用户编写 Nano Banana Pro / Nano Banana 2 AI 生图 Prompt。
  当用户需要生成图片、写图片 prompt、使用 Nano Banana、NBP2、Gemini 生图时自动触发。
  触发关键词：生图、图片 prompt、Nano Banana、NBP2、AI 生图、image prompt
argument-hint: "[图片描述 或 场景需求]"
allowed-tools: Read, Bash
disable-model-invocation: true
---

<task>
根据用户的描述需求，生成针对 Nano Banana Pro 2（Google Gemini 图像生成模型）优化的高质量 Prompt。
</task>

<context>

## Nano Banana 模型概览

| 特性 | Nano Banana Pro (Gemini 3 Pro) | Nano Banana 2 (Gemini 3.1 Flash) |
|------|-------------------------------|----------------------------------|
| 速度 (1K) | 10-20 秒 | 4-6 秒 |
| 价格/张 | ~$0.15 | ~$0.08 |
| 质量 | 最佳 | Pro 的 ~95% |
| Image Search Grounding | 无 | 有（可检索真实参考图） |
| Thinking Mode | 有 | 有（Minimal/High/Dynamic） |
| 角色一致性 | 强 | 最多 5 角色、14 对象/工作流 |
| Model ID | gemini-3-pro-image | gemini-3.1-flash-image-preview |

> **注**：价格/速度/Model ID 数据截至 2026-04，以 [Google 官方](https://ai.google.dev/) 最新定价为准。

## 核心差异 — 工作流策略

- **Pro**：精雕细琢单个 prompt，追求一次到位的最高品质
- **Nano Banana 2**：快速起步 → 迭代精修（速度优势支撑多轮对话式调整）

</context>

<workflow>

## Step 1: 理解用户需求

### 1a. 有参数（`/nbp2 <需求描述>`）

直接从 `$ARGUMENTS` 提取主题，**目标模型默认 NBP2**（性价比高）。如需特殊要求（角色一致性/Pro 模式等），Codex 根据描述推断。

### 1b. 无参数（`/nbp2`）

**MUST 用 AskUserQuestion 一次问清**（避免散文来回）：

```
Question: 要生成什么图片？选择场景 + 目标模型

Header: "生图需求"

Options:
1. 社交媒体封面 / 海报（NBP2 默认）
2. 产品摄影（商业用途）
3. 电影感场景 / 大幅概念图（建议 Pro）
4. 角色 / IP 一致性（多图工作流，需 NBP2）
5. 自定义（自由输入主题 + 需求）
```

选 5 用户自由输入；选 1-4 → Codex 根据类型自动选择模型并询问具体主题。

### 1c. 按需提取四要素

无论哪种输入方式，最终要明确：
1. **画面主题** — 要画什么？
2. **用途场景** — 社交媒体封面？产品图？海报？个人创作？
3. **目标模型** — Pro（最高品质）或 NBP2（快速迭代）？**默认 NBP2**
4. **特殊要求** — 需要文字渲染？角色一致性？真实地标？

## Step 2: 按六要素公式构建 Prompt

按以下顺序组织（越前面权重越高）：

### 公式：`[主体] + [动作/关系] + [场景/环境] + [构图/镜头] + [风格/介质] + [光线]`

### 各要素详解

**1. 主体 (Subject)** — 最重要
- 具体描述：数量、年龄、材质、形状、服装
- 差：`a woman in a red dress`
- 好：`a sophisticated elderly woman wearing a vintage Chanel-style tweed suit, silver hair in a French twist`

**2. 动作与关系 (Action & Relationships)**
- 主体在做什么，与其他元素的交互
- 例：`reading a leather-bound book while her cat sleeps on the armrest beside her`

**3. 场景/环境 (Setting / Location)**
- 地点、时间、天气、氛围
- 例：`in a sunlit Parisian apartment with tall windows overlooking autumn chestnut trees, late afternoon`

**4. 构图/镜头 (Composition / Camera)**
- 镜头角度、焦距、景深、取景
- 关键术语：`low angle` / `aerial view` / `close-up` / `wide shot` / `over-the-shoulder`
- 镜头：`50mm portrait lens` / `macro at f/8` / `35mm wide angle`
- 例：`medium shot, 85mm lens at f/2.8, shallow depth of field with soft bokeh`

**5. 风格/介质 (Style & Medium)**
- 摄影 / 插画 / 3D / 水彩 / 像素风 / 油画 ...
- 时代风格：`1960s aesthetic`（自动暗示胶片颗粒和褪色调色板）
- 例：`film photography style inspired by Kodak Portra 400, warm tones, subtle grain`

**6. 光线 (Lighting)**
- 主光源位置、阴影行为、雾感/光晕
- 例：`soft key light from camera-left, subtle rim light on shoulders, faint atmospheric haze`

## Step 3: 应用进阶技巧

### 文字渲染
- 精确文字必须用引号包裹：`with the text "MIDNIGHT REVERIE" in bold art deco typography`
- 指定字体风格：`bold sans-serif` / `handwritten script` / `retro neon sign`
- 多语言支持：可指定 10+ 种语言

### 负面约束（抑制不想要的元素）
- 在 prompt 末尾添加：`no text, no watermark, no extra limbs, no deformed hands, clean framing`
- 如果不要文字：`clean image without any typography or text overlays`
- 通用安全负面约束：`no low quality, no blurry, no grain, no watermark, no bad anatomy, no extra fingers, no cluttered background`

### 角色一致性（多图工作流）
- 先生成角色设定图（多角度）：`Generate a character reference sheet showing front, profile, and three-quarter views of [character description]`
- 后续引用：`Using the character from @img1, place them in [new scene], maintaining the same outfit and facial features`
- NBP2 最多支持 5 角色 + 14 对象

### Image Search Grounding（仅 NBP2）
- 用于真实地标/名人/品牌/实时数据
- 触发词：`search for` / `latest` / `current` / `real-time`
- 例：`Use image search to find accurate reference of the Sydney Opera House. Create a cinematic 3:2 photo of it at golden hour with dramatic clouds`

### Thinking Mode
- 适合复杂构图、需要推理的场景
- 通过 API 参数 `include_thoughts` 启用
- 成本增加约 20-40%，但质量显著提升

## Step 4: 输出格式

向用户提供：

```
## NBP2 Prompt

**目标模型**: [Pro / Nano Banana 2]
**建议分辨率**: [如 1024x1024, 1920x1080, 等]

### Prompt

[完整的英文 prompt，自然语言描述，不是标签堆叠]

### Negative Constraints

[负面约束，逗号分隔]

### 调优建议

- [针对该场景的 1-3 条调整建议]
```

</workflow>

<rules>

## 关键规则

1. **自然语言，不是标签堆叠** — 用完整句子和正确语法描述画面，不要 `dog, park, 4k, realistic, HDR` 这种旧式标签
2. **Prompt 用英文** — Nano Banana 对英文 prompt 效果最好，即使用户用中文描述需求，输出的 prompt 也用英文
3. **具体胜过模糊** — `a 30-year-old woman with freckles and warm brown hair` 远优于 `a beautiful woman`
4. **避免矛盾** — 不要同时要求 `bright sunlight` 和 `dark moody shadows`
5. **顺序即权重** — 最重要的描述放最前面
6. **Pro vs NBP2 策略不同**：
   - Pro：写一个精确详尽的 prompt
   - NBP2：先写简短 prompt 锁定方向，再迭代精修
7. **文字必须引号包裹** — 需要渲染的文字用双引号标注
8. **如用户未指定模型，默认推荐 NBP2** — 性价比更高，速度更快，支持 Image Search Grounding

</rules>

<examples>

## 示例 Prompt

### 产品摄影
```
A luxury wristwatch with silver metal band and black face showing 10:10 time,
reflective polished surface. High-end product photography, commercial advertising
aesthetic, shot on Phase One XF. Macro lens at f/8 for sharp detail, controlled
studio lighting with softbox from above and reflector cards bouncing light onto
the watch face, dramatic shadows underneath. Horizontal composition, watch centered
on white seamless background with slight angle to show depth and dimension.
No text, no watermark, clean framing.
```

### 电影感场景
```
A cinematic wide shot of a futuristic sports car speeding through a rainy Tokyo
street at night, neon reflections on wet asphalt, motion blur on background lights,
shot from a low angle, moody cyberpunk atmosphere. Anamorphic lens flare,
teal and orange color grading, 35mm film grain.
No text, no logos, no extra vehicles blocking the subject.
```

### 杂志封面（含文字）
```
A glossy fashion magazine cover featuring a confident young woman with short
platinum blonde hair, wearing an oversized blazer in electric blue, shot against
a minimalist coral background. The bold title "VANGUARD" in large uppercase
serif typography at the top, "Spring Collection 2026" in smaller elegant type
below. Studio lighting with beauty dish, catchlights in eyes, high-fashion
editorial style. Clean layout, no clutter.
```

### 等距场景
```
A perfectly isometric captured photograph of a beautiful modern rooftop garden.
Features a 2-shaped swimming pool with turquoise water, surrounded by lush
tropical plants, wooden deck chairs, and string lights. Golden hour lighting
casting long shadows, photorealistic style. The text "PARADISE" in clean
white sans-serif at the bottom right corner.
No tilt-shift blur, no miniature effect.
```

### 艺术/混合媒介
```
An everyday scene at a busy morning cafe. In the foreground, an anime-style
man with electric blue hair drinks espresso, next to a woman rendered as a
detailed pencil sketch, and a third patron as a claymation figure. The cafe
environment itself is photorealistic with warm ambient lighting, steam rising
from coffee cups, and rain visible through the window.
No watermark, no text overlays.
```

</examples>
