# 做自己的 Tony · 染发 Agent 前端

> 当前首页已升级为最新 P0 全流程，并按 `frontend-backend-api-contract(4).md` 接口接入。启动、联调、代码结构和已知接口缺口请先看 [FRONTEND_HANDOFF.md](./FRONTEND_HANDOFF.md)。

当前版本保留下面旧 Demo 的设计体系与美术资产，但交互链路已经更新为：

```text
抖音种草 → 现场拍发色 → 识别确认 → 可行性/风险/五档预览
→ 染色或固色 → 预算选品 → 保存档案 → 分段教程与语音问答
→ 染后记录与转场视频
```

---

## 旧 Demo 说明（视觉与历史实现参考）

> 上传两张头发照片 → AI 判断能不能染 → 推荐染膏 + 调配比例 → 跟着语音指令染发

让女生不去理发店、不踩坑、不浪费钱，**在家把头发染得像博主一样好看**。

---

## 一句话定位

把小红书博主的染发教程「翻译」成**只针对你头发情况的个性化方案** —— 用 AI 评估可行性、用真实评论选染膏、用语音陪你完成整个染发流程。

---

## 核心特性

### 🪞 5 步流程，每步只做一件事

| 步骤 | 用户做什么 | 我们做什么 |
|------|----------|----------|
| **1. 上传** | 拍两张图（现在的头发 + 想染的颜色），可选粘贴博主链接/视频 | Claude Vision 分析发长、底色、漂染史 |
| **2. 判断** | 看「能 / 能但有限制 / 暂时不行」 | 调用染发知识库判断可行性 + 给预算/耗时/前置条件 |
| **3. 选品** | 从 3 款染膏里选 1 个 | Claude 用 30 篇小红书真实评价交叉选品，附 pros/cons/原话引用 + 淘宝实时价 |
| **4. 调配** | 看数字照着倒 | per-product 比例（NV 1:8、玫丽盼 1:1 等），从博主原话提取，不是泛泛的 1:1 |
| **5. 操作** | 跟着 5 步染头发，**用语音控制翻页** | TTS 自动朗读、Whisper ASR + Claude 意图识别、博主帧轮播 |

### 🎤 真正能用的语音助手

不是简单的「按住录音」，是**说完静音 1 秒自动识别**：

- **Whisper ASR**（large-v3-turbo，中文准确率高）转录
- **Claude Haiku** 做意图理解，听得懂口语：
  - 「我头发分好区了，下一步」→ 跳下一步
  - 「我还没弄好呢」→ 回上一步
  - 「帮我定个闹钟」→ 根据当前步骤的「停留 30 分钟」自动设 30 分钟倒计时
  - 「读一下 / 别说了 / 安静」→ 控制朗读
- **qwen3-tts-flash** 朗读，**ttsSeq 序号机制防双播**（关键 bug 修复）
- 进入操作步骤主动弹「要不要开语音」+ 进入「停留时间」主动弹「要不要设闹钟」

### 🎥 视频自动解析

`scripts/process-video.mjs`：上传染发教程视频 →
1. `ffmpeg` 抽音频
2. Whisper 带时间戳转录
3. Claude 把碎句聚合成 **background_knowledge**（科普）+ **action_steps**（操作）两类
4. **每个操作步骤抽 4-8 张候选帧 → Vision API 选优**，保证每张都是真实操作画面
5. 集成到 Step 5 作博主示范，自动 4 秒轮播

### 🛒 真实数据，不是 AI 幻觉

**`scripts/build-knowledge-base.mjs`**：用 Playwright 爬 30 篇小红书真实笔记 → Claude 提取后产出：

- `products.json`：23 个真实产品 + 淘宝价 + 用户原话证据
- `knowledge.json`：44 条真实知识条目，分 7 类（底色匹配/避坑/价格情报/操作技巧/...）

教程生成时这些数据全部注入 Claude prompt，**强制要求 pros/cons/reviews 必须来自原话**，杜绝瞎编。

### 🎨 灵动 UI（不再是 AI 方块脸）

- **5 色 pastel 配色**：`#F98C53` 橙 / `#D2E0AA` 嫩绿 / `#ABD7FB` 天蓝 / `#F9F2EF` 奶白 / `#FCCEB4` 杏粉
- 思源黑体（Noto Sans SC）作为中文主字体
- 染膏卡片**左右交错旋转**（-1.2°/+1.5°），hover 时回正
- 散落 SVG 装饰：星、心、squiggle 装饰随机分布 + 浮动动效
- **5 张卡通女孩 PNG（已抠透明背景）每 0.5s 循环切换**作 loading 动画

---

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | Next.js 16 (App Router) + Tailwind v4 + React 19 |
| AI | Claude Opus 4.7 (vision + 教程生成) / Haiku 4.5 (意图识别) / Whisper / Gemini 2.5 Flash Image / qwen3-tts |
| 视频处理 | ffmpeg-static + Playwright |
| 知识库 | Playwright 爬小红书 + Claude 结构化抽取 |

API 路由：

```
app/api/
├── analyze/          # Vision 分析头发
├── compare/          # 可行性判断 + 博主对比
├── tutorial/         # 个性化教程生成（带知识库注入）
├── parse-url/        # 解析小红书/抖音链接
├── process-video/    # 上传视频 → 完整解析管线
├── price/            # Playwright 爬淘宝实时价
├── whisper/          # 转发到 Whisper ASR
├── voice-intent/     # Claude Haiku 意图识别
└── tts/              # 转发到 qwen3-tts-flash
```

---

## 本地运行

```bash
git clone https://github.com/Fiona309/my-tony.git
cd my-tony
npm install

# 配置 .env.local（找作者要 key 或自备 Claude API key）
cat > .env.local <<'EOF'
ANTHROPIC_API_KEY=sk-...
ANTHROPIC_BASE_URL=https://api.openai-next.com
EOF

npm run dev
# 打开 http://localhost:3000
```

**首次启动注意**：`scripts/build-knowledge-base.mjs` 需要登录小红书；`scripts/login-taobao.mjs` 需要登录淘宝（用 Playwright headed 模式扫码即可）。**不影响主流程演示** —— 仓库已包含跑好的 `products.json` / `knowledge.json` 和 mock 视频解析结果。

---

## Demo 走完一次

1. Step 1 点「📺 试用示例」自动加载已解析好的博主视频（无需上传）
2. 上传两张头发照片 → 点「开始分析」（5 秒 loading 显示卡通女孩动画）
3. 编辑分析结果 → 点「确认无误，判断我能不能染」
4. 看到 verdict 大字 + 预算/耗时/我 vs 博主对比 → 点「挑染膏 →」
5. 看 3 款染膏（含真实评价 + 淘宝价）→ 选一款 → 「按这款方法调配 →」
6. 看比例 + 用量数字 + 真实经验引用 → 「都调好了，开始染 →」
7. 弹「要不要开语音」→ 开启 → 跟着 5 步染发，**整个过程不碰手机**
8. 到「停留 30 分钟」自动弹闹钟设置弹窗 + 30 分钟后系统通知

---

## 一些实现细节（值得拎出来）

### ttsSeq 序号机制

修复了语音切换步骤时 TTS 双播 bug。`stopTts` 不只暂停 audio，还把 `ttsSeqRef.current += 1`。`playStepTts` 内每次 await 之后都校验 `ttsSeqRef.current !== mySeq` → 旧请求即使完成也会被抛弃。

### Vision 选优关键帧

视频抽帧时不是固定时间间隔，而是先在步骤时间段内撒网抽 4-8 张候选，把整批 base64 喂给 Claude Vision，让它返回「最能体现该步骤连续动作」的 3-4 张索引。结果是**连环画级别的步骤配图**，跳过博主对镜讲话、镜头切换、被遮挡画面。

### 知识库注入式 RAG

不是用向量搜索，而是把 products.json + 按 category 分组的 knowledge.json 直接塞 Claude prompt（max_tokens 10000），通过硬性 prompt 规则强制 Claude 引用真实原话，cons 必须包含负面评价（如 "bela 这个牌子一点用没有"）。

### 语音意图两层架构

```
浏览器 MediaRecorder → VAD（基于 RMS 音量）检测说话结束 → Whisper 转录
     ↓
正则快配（命中即执行，<50ms）
     ↓ 没命中
Claude Haiku 意图识别（~2s，带当前 step 上下文）
     ↓
voiceProcessingRef 锁防并发堆积
```

---

## 路线图（hackathon 内未做完）

- AI 生成「我染后的预期效果图」（已验证 Gemini 2.5 Flash Image 可行）
- 真正的产品图（试过 Bing 图搜不稳定，需要更专业的 scraper）
- 漂发指引和定时器联动

---

## 致谢

- Claude Opus 4.7（vision + 文案生成）
- Whisper / qwen-tts / Gemini Image
- 小红书所有染过头发的姐妹们 ❤️

🤖 *与 Claude Code 协作开发完成*
