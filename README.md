# Tony · AI 居家染发助手

Tony 帮助用户在家染发前判断目标发色是否可达、对比直染与漂后方案，并在染发过程中按步骤操作。染完后可以保存照片和操作记录，回顾染前与染后的变化。

## 产品功能与模型

下表按用户操作顺序列出主流程的模型和实现。模型名以仓库代码默认值为准，部署时可通过配置覆盖。

| 功能 | 用户看到什么 | 模型与实现 |
| --- | --- | --- |
| 发色识别与档案 | 上传当前发色照片、选择目标色，确认识别结果与头发属性 | 具备当前照片和目标参考图时，后端通过 OpenAI Next 调用 **GPT-4o mini**（`gpt-4o-mini`）分析两张图，提取发色、发长、发量和染发历史相关特征。缺少参考图或模型配置时，可走本地取色和色卡匹配。 |
| 可达性判断与方案 | 查看当前底色下的直染结果、偏色风险及漂后选项 | **规则与数据矩阵**。后端根据当前色度、目标色系和实测效果矩阵生成判断与色值。 |
| 实时试色 | 在摄像头画面中切换颜色，观察头发区域变化 | 浏览器端 **MediaPipe Hair Segmenter**（`hair_segmenter.tflite`）输出头发遮罩，可回退到 **Selfie Multiclass 256×256**。前端用矩阵色值对遮罩区域做颜色变换。 |
| 染后效果图 | 对比标准、偏浅、偏深等预览；部分方案提供偏色预览 | 后端通过 OpenRouter 调用 **Gemini 2.5 Flash Image**（`google/gemini-2.5-flash-image`）。发色管线以实测矩阵确定目标 RGB，并支持用 MediaPipe TFLite 或 `hair_seg_smp.onnx` 分割发区，配合本地颜色处理。 |
| 产品参考 | 查看与方案相关的染发产品和购买参考 | **结构化产品知识库与匹配规则**。后端从产品数据中匹配候选。 |
| 分步教程 | 查看操作步骤、切换进度、使用计时和播报 | **教程配置与会话状态**管理流程。语音播报默认可使用浏览器 `speechSynthesis`，配置云端 TTS 时默认模型为 **Qwen3-TTS Flash**（`qwen3-tts-flash`）。 |
| 语音转写 | 在教程中说“下一步”“重播”，或直接提问 | 云端默认通过 OpenAI Next 使用 **Whisper Large V3 Turbo**（`whisper-large-v3-turbo`）。可切换到硅基流动的 **SenseVoiceSmall**（`FunAudioLLM/SenseVoiceSmall`），或在本地运行 **SenseVoiceSmall**（`iic/SenseVoiceSmall`），搭配 **FSMN-VAD** 检测语音区间。 |
| 语音指令与操作问答 | 推进或重播教程，或根据当前步骤回答问题 | 常用指令先匹配关键词，其他意图及问题改写、答案润色可使用 **GPT-4o mini**。操作知识库支持通过硅基流动的 **BGE Large Chinese v1.5**（`BAAI/bge-large-zh-v1.5`）生成向量，以 ChromaDB 检索，并支持词法匹配。 |
| 染后档案与转场视频 | 保存染前、染后照片和操作记录，并生成对比视频 | 档案保存在 SQLite，媒体写入本地目录。视频任务将两张照片作为首尾帧提交给视频服务。模型 ID 默认配置为 **Wan 2.2 首尾帧模型**（`wan2.2-kf2v-flash`），服务路由由 `TRANSITION_VIDEO_PROVIDER` 单独配置，部署时需与模型配套。 |

效果预览用于比较方案，实际发色受底色、发质和操作条件影响。

## 技术架构

- **Web 前端**采用 Next.js App Router、React 和 TypeScript。首页加载 Tony 主应用，负责表单、摄像头、录音、教程界面和后台任务轮询。入口见 [首页](my-tony2.0/app/page.tsx)、[主流程](my-tony2.0/app/tony/)和 [API 客户端](my-tony2.0/app/tony/api.ts)。
- **业务 API**采用 Python 和 FastAPI，负责照片上传、发色档案、方案判断、推荐、教程会话和染后记录。效果图与转场视频在后台线程中生成，前端通过任务接口查询结果。入口见 [FastAPI 应用](backend/app/main.py)和 [服务模块](backend/app/services/)。
- **图像处理**由浏览器实时试色和服务端图片生成两条链路组成。两条链路使用实测矩阵确定目标色值。服务端发色管线可独立运行。代码见 [实时试色](my-tony2.0/app/tony/hair-mirror-core.ts)和 [发色管线](hair_full_pipeline/)。
- **数据与知识库**使用 SQLite 保存应用状态与色彩效果矩阵，媒体保存在本地文件目录。操作问答使用 ChromaDB 支持向量检索。代码与数据见 [数据库](backend/app/database.py)、[知识库](backend/app/kb/)和 [后端数据](backend/data/)。

模型及服务配置项见 [后端配置](backend/app/config.py)和 [配置示例](backend/.env.example)。开发环境与模拟模式见 [本地运行指南](LOCAL_DEV.md)。
