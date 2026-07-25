import {
  CURRENT_COLOR_OPTIONS,
  CURRENT_GOLD,
  EDITABLE_OPTIONS,
  MOCK_VIDEOS,
  TARGET_META,
  TUTORIAL_STEPS,
  TUTORIAL_STEPS_BY_VIDEO_ID,
  TUTORIAL_VIDEO_META,
  productsForRoute,
  toArchiveSummary,
} from './mock-data';
import type {
  AfterPhotoData,
  AfterVideoTaskData,
  ApiEnvelope,
  ApiMode,
  ArchiveCreateData,
  ArchiveDetailData,
  ArchiveListData,
  Budget,
  CompletionRecord,
  FlowDraft,
  HairColor,
  HairProfileConfirmationData,
  HairProfileData,
  HairProfileUpdate,
  MediaImageData,
  MockVideosData,
  PlanResultData,
  PreviewImage,
  PreviewTaskData,
  ProductRecommendationData,
  PurchaseStatus,
  RouteType,
  TutorialAction,
  TutorialSessionData,
} from './types';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api').replace(/\/$/, '');
export const API_MODE = (process.env.NEXT_PUBLIC_API_MODE === 'real' ? 'real' : 'mock') satisfies ApiMode;

const USER_KEY_STORAGE = 'tony:user-key:v1';
const DRAFT_STORAGE = 'tony:flow-draft:v2';
const ARCHIVE_STORAGE = 'tony:archives:v2';
const SESSION_STORAGE = 'tony:tutorial-sessions:v2';

export class ApiError extends Error {
  code: number;
  traceId?: string;

  constructor(message: string, code = -1, traceId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.traceId = traceId;
  }
}

function getUserKey() {
  if (typeof window === 'undefined') return 'server-render';
  const existing = window.localStorage.getItem(USER_KEY_STORAGE);
  if (existing) return existing;
  const next = window.crypto.randomUUID();
  window.localStorage.setItem(USER_KEY_STORAGE, next);
  return next;
}

function mediaOrigin() {
  if (!API_BASE_URL.startsWith('http://') && !API_BASE_URL.startsWith('https://')) {
    return '';
  }
  return new URL(API_BASE_URL).origin;
}

function resolveMediaUrls<T>(value: T): T {
  const origin = mediaOrigin();
  if (!origin || !value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => resolveMediaUrls(item)) as T;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      const isRelativeMediaUrl =
        (key === 'url' || key.endsWith('_url')) &&
        key !== 'purchase_url' &&
        typeof item === 'string' &&
        item.startsWith('/');
      return [
        key,
        isRelativeMediaUrl ? `${origin}${item}` : resolveMediaUrls(item),
      ];
    }),
  ) as T;
}

function qaSummaryStatement(text: string) {
  let raw = text.trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  if (raw.includes('：')) raw = raw.split('：').slice(1).join('：').trim();
  else if (raw.includes(':')) raw = raw.split(':').slice(1).join(':').trim();
  for (const prefix of ['好的，', '好的。', '嗯，', '嗯。', '哦，', '哦。', '根据染膏说明书，']) {
    if (raw.startsWith(prefix)) raw = raw.slice(prefix.length).trim();
  }
  raw = raw.replaceAll('哦', '').trim();
  const sentence = raw.split(/[。！？；;]/)[0]?.trim() || raw;
  const clipped = sentence.length > 72 ? `${sentence.slice(0, 72).replace(/[，,。；; ]+$/, '')}…` : sentence;
  return clipped ? `${clipped}。` : '';
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-User-Key', getUserKey());
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('网络连接失败，请检查后端服务是否已启动');
  }

  let envelope: ApiEnvelope<T>;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError(`接口返回了无法解析的数据（HTTP ${response.status}）`);
  }

  if (!response.ok || envelope.code !== 0) {
    throw new ApiError(
      envelope.message || `请求失败（HTTP ${response.status}）`,
      envelope.code,
      envelope.trace_id,
    );
  }
  return resolveMediaUrls(envelope.data);
}

function sleep(ms = 420) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function uid(prefix: string) {
  return `${prefix}_${window.crypto.randomUUID().slice(0, 8)}`;
}

export function createClientId() {
  if (typeof window === 'undefined') return 'server-render';
  return window.crypto.randomUUID();
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(key, JSON.stringify(value));
  }
}

function targetKeyFromVideoId(videoId: string) {
  return Object.keys(TARGET_META).find((key) => videoId.includes(key)) ?? 'blue';
}

function tutorialVideoIdFromEntryVideoId(videoId: string) {
  return (
    MOCK_VIDEOS.find((video) => video.video_id === videoId)?.bound_tutorial_video_id ??
    'tutorial_blue'
  );
}

function tutorialStepsForVideoId(tutorialVideoId?: string) {
  return TUTORIAL_STEPS_BY_VIDEO_ID[tutorialVideoId ?? ''] ?? TUTORIAL_STEPS;
}

function colorWithoutConfidence(color: HairColor): HairColor {
  const { confidence, ...confirmed } = color;
  void confidence;
  return confirmed;
}

const profileStore = new Map<string, HairProfileData>();
const profileEntryStore = new Map<
  string,
  { entryVideoId: string; currentImageId: string }
>();
const planStore = new Map<string, PlanResultData>();
const previewTaskStore = new Map<
  string,
  { polls: number; images: PreviewImage[]; createdAt: number }
>();
const recommendationStore = new Map<string, ProductRecommendationData>();
const planSelections = new Map<
  string,
  { route: RouteType; previewLevel: number }
>();
const afterTaskPolls = new Map<string, number>();
const afterTaskByImage = new Map<string, string>();

function loadArchives() {
  return readJson<ArchiveDetailData[]>(ARCHIVE_STORAGE, []);
}

function saveArchives(archives: ArchiveDetailData[]) {
  writeJson(ARCHIVE_STORAGE, archives);
}

function loadSessions() {
  return readJson<Record<string, TutorialSessionData>>(SESSION_STORAGE, {});
}

function saveSessions(sessions: Record<string, TutorialSessionData>) {
  writeJson(SESSION_STORAGE, sessions);
}

export function saveFlowDraft(draft: FlowDraft) {
  writeJson(DRAFT_STORAGE, draft);
}

export function loadFlowDraft() {
  return readJson<FlowDraft | null>(DRAFT_STORAGE, null);
}

export function clearFlowDraft() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(DRAFT_STORAGE);
}

export async function getMockVideos(signal?: AbortSignal) {
  if (API_MODE === 'real') {
    return request<MockVideosData>('/mock/videos', {}, signal);
  }
  await sleep(360);
  return { videos: MOCK_VIDEOS };
}

export async function uploadImage(
  file: File,
  mediaType: 'current_hair' | 'after_hair',
) {
  if (API_MODE === 'real') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('media_type', mediaType);
    return request<MediaImageData>('/media/images', {
      method: 'POST',
      body: formData,
    });
  }
  await sleep(520);
  const imageId = uid(mediaType === 'current_hair' ? 'img_current' : 'img_after');
  return {
    image_id: imageId,
    media_type: mediaType,
    storage_key: `uploads/${mediaType === 'current_hair' ? 'current' : 'after'}/${imageId}.jpg`,
    url: URL.createObjectURL(file),
  } satisfies MediaImageData;
}

export async function createHairProfile(input: {
  entry_video_id: string;
  current_image_id: string;
}) {
  if (API_MODE === 'real') {
    return request<HairProfileData>('/hair-profiles', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  await sleep(760);
  const targetKey = targetKeyFromVideoId(input.entry_video_id);
  const target = TARGET_META[targetKey].color;
  const profileId = uid('profile');
  const pudding = targetKey === 'blue' || targetKey === 'purple';
  const profile: HairProfileData = {
    profile_id: profileId,
    status: 'need_confirm',
    target_color: target,
    current_hair: pudding
      ? {
          region_mode: 'root_mid_end',
          regions: {
            root: {
              color: {
                tone: 'natural_black',
                level: 3,
                saturation: 'dark',
                display_name: '3 度自然黑新根',
                confidence: 0.88,
              },
            },
            mid: {
              color: {
                tone: 'yellow_orange',
                level: 7,
                saturation: 'medium',
                display_name: '7 度橘金',
                confidence: 0.72,
              },
            },
            end: {
              color: CURRENT_GOLD,
              color_options: CURRENT_COLOR_OPTIONS,
            },
          },
        }
      : {
          region_mode: 'single',
          color: CURRENT_GOLD,
          color_options: CURRENT_COLOR_OPTIONS,
        },
    hair_length: 'chest',
    hair_volume: 'medium',
    dye_history: 'dyed_no_bleach',
    attribute_confidences: {
      hair_length: 0.85,
      hair_volume: 0.72,
      dye_history: 0.68,
      current_color: pudding ? 0.72 : 0.76,
      target_color: target.confidence ?? 0.92,
    },
    editable_options: EDITABLE_OPTIONS,
  };
  profileStore.set(profileId, profile);
  profileEntryStore.set(profileId, {
    entryVideoId: input.entry_video_id,
    currentImageId: input.current_image_id,
  });
  return profile;
}

export async function updateHairProfile(
  profileId: string,
  update: HairProfileUpdate,
) {
  if (API_MODE === 'real') {
    return request<HairProfileConfirmationData>(`/hair-profiles/${profileId}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    });
  }
  await sleep(360);
  const existing = profileStore.get(profileId);
  if (!existing) throw new ApiError('没有找到这次发色识别，请重新开始');
  const confirmed: HairProfileData = {
    ...existing,
    status: 'confirmed',
    target_color: update.target_color ?? existing.target_color,
    current_hair: update.current_hair,
    hair_length: update.hair_length,
    hair_volume: update.hair_volume,
    dye_history: update.dye_history,
  };
  profileStore.set(profileId, confirmed);
  return { profile_id: profileId, status: 'confirmed' } satisfies HairProfileConfirmationData;
}

export async function getPlanResult(profileId: string) {
  if (API_MODE === 'real') {
    return request<PlanResultData>('/agent/plan-result', {
      method: 'POST',
      body: JSON.stringify({ profile_id: profileId }),
    });
  }
  await sleep(1350);
  const profile = profileStore.get(profileId);
  if (!profile) throw new ApiError('画像已失效，请返回重新确认');
  const targetKey =
    Object.entries(TARGET_META).find(
      ([, meta]) => meta.color.tone === profile.target_color.tone,
    )?.[0] ?? 'blue';
  const targetMeta = TARGET_META[targetKey];
  const hasBlackHistory = profile.dye_history === 'dyed_black';
  const planId = uid('plan');
  const previewTaskId = uid('preview');
  const previewFrames = [
    '/video-mock/frames/step-1-2.jpg',
    '/video-mock/frames/step-2-2.jpg',
    '/video-mock/frames/step-3-2.jpg',
    '/video-mock/frames/step-4-1.jpg',
    '/video-mock/frames/step-6-3.jpg',
  ];
  const previewImages: PreviewImage[] = previewFrames.map((url, index) => ({
    preview_level: index + 1,
    label: ['柔和低饱和', '偏浅通透', '推荐效果', '鲜明显色', '高饱和效果'][
      index
    ],
    url,
    storage_key: `mock/previews/${previewTaskId}_l${index + 1}.jpg`,
    enabled: true,
  }));
  const previewLabels = Object.fromEntries(
    previewImages.map((item) => [String(item.preview_level), item.label]),
  );
  const plan: PlanResultData = {
    profile_id: profileId,
    plan_id: planId,
    feasibility: hasBlackHistory ? 'salon_required' : 'conditional',
    summary: hasBlackHistory
      ? '染黑史会明显阻碍目标色显色，本次不建议在家直接操作。'
      : `可以尝试，但当前暖金底叠加${profile.target_color.display_name}，结果可能${targetMeta.riskName}。`,
    reachability_score: hasBlackHistory ? 34 : targetKey === 'brown' ? 86 : 78,
    risks: hasBlackHistory
      ? [
          {
            title: '染黑史导致难上色',
            severity: 'high',
            reason: '深色人工色素会阻挡目标颜色显现。',
            suggestion: '建议先由理发店判断并处理，不在家自行漂发。',
          },
        ]
      : [
          {
            title: `可能${targetMeta.riskName}`,
            severity: 'medium',
            reason: `当前暖黄底会与${profile.target_color.display_name}发生颜色叠加。`,
            suggestion: '把五档预览当作结果范围，并优先选择推荐档位。',
          },
          ...(profile.current_hair.region_mode === 'root_mid_end'
            ? [
                {
                  title: '根尾可能不完全一致',
                  severity: 'medium' as const,
                  reason: '发根较深，发中和发尾底色更浅。',
                  suggestion: '操作时需要分区控制上色顺序和停留时间。',
                },
              ]
            : []),
        ],
    preview_status: 'generating',
    preview_task_id: previewTaskId,
    preview_images: [],
    preview_labels: previewLabels,
    route_cards: [
      {
        route: 'dye',
        title: '染色',
        recommended: true,
        reason: '维持时间更长，在当前底色上更接近目标色。',
      },
      {
        route: 'color_deposit',
        title: '固色',
        recommended: false,
        reason: '操作更简单，适合浅底色补色或短期改色。',
      },
    ],
    default_route: 'dye',
    default_preview_level: 3,
    can_recommend_product: !hasBlackHistory,
  };
  planStore.set(planId, plan);
  previewTaskStore.set(previewTaskId, {
    polls: 0,
    images: previewImages,
    createdAt: Date.now(),
  });
  return plan;
}

export async function getPreviewTask(previewTaskId: string) {
  if (API_MODE === 'real') {
    return request<PreviewTaskData>(`/preview-tasks/${previewTaskId}`);
  }
  await sleep(240);
  const task = previewTaskStore.get(previewTaskId);
  if (!task) throw new ApiError('效果预览任务不存在，请重新生成方案');
  task.polls += 1;
  previewTaskStore.set(previewTaskId, task);
  const elapsedSeconds = Math.max(1, Math.round((Date.now() - task.createdAt) / 1000));
  if (task.polls === 1) {
    return {
      preview_task_id: previewTaskId,
      status: 'queued',
      progress_percent: 0,
      elapsed_seconds: elapsedSeconds,
      preview_images: [],
    } satisfies PreviewTaskData;
  }
  if (task.polls < 4) {
    return {
      preview_task_id: previewTaskId,
      status: 'generating',
      progress_percent: Math.min(88, task.polls * 34),
      elapsed_seconds: elapsedSeconds,
      preview_images: [],
    } satisfies PreviewTaskData;
  }
  return {
    preview_task_id: previewTaskId,
    status: 'completed',
    elapsed_seconds: elapsedSeconds,
    preview_images: task.images,
  } satisfies PreviewTaskData;
}

export async function getProductRecommendations(input: {
  profile_id: string;
  plan_id: string;
  selected_route: RouteType;
  selected_preview_level: number;
  budget: Budget;
}) {
  if (API_MODE === 'real') {
    return request<ProductRecommendationData>('/agent/product-recommendations', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  await sleep(920);
  const candidates = productsForRoute(input.selected_route).filter(
    ({ primary }) =>
      primary.price.total_price >= input.budget.min_price &&
      primary.price.total_price <= input.budget.max_price,
  );
  const recommendationId = uid('recommendation');
  const data: ProductRecommendationData = candidates.length
    ? {
        profile_id: input.profile_id,
        plan_id: input.plan_id,
        recommendation_id: recommendationId,
        status: 'available',
        selected_route: input.selected_route,
        primary_product:
          candidates.find(({ primary }) => primary.is_video_same_product)?.primary ??
          candidates[0].primary,
        other_products: candidates
          .filter(
            ({ primary }) =>
              primary.sku_id !==
              (candidates.find(({ primary }) => primary.is_video_same_product)?.primary
                .sku_id ?? candidates[0].primary.sku_id),
          )
          .map(({ other }) => other),
      }
    : {
        profile_id: input.profile_id,
        plan_id: input.plan_id,
        recommendation_id: recommendationId,
        status: 'no_match',
        selected_route: input.selected_route,
        primary_product: null,
        other_products: [],
        message: '当前预算和方案下暂未找到合适商品',
      };
  recommendationStore.set(recommendationId, data);
  planSelections.set(input.plan_id, {
    route: input.selected_route,
    previewLevel: input.selected_preview_level,
  });
  return data;
}

export async function createArchive(input: {
  profile_id: string;
  plan_id: string;
  recommendation_id: string;
  sku_id: string;
  purchase_status: PurchaseStatus;
}) {
  if (API_MODE === 'real') {
    return request<ArchiveCreateData>('/hair-dye-archives', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  await sleep(620);
  const profile = profileStore.get(input.profile_id);
  const plan = planStore.get(input.plan_id);
  const recommendation = recommendationStore.get(input.recommendation_id);
  if (!profile || !plan || !recommendation) {
    throw new ApiError('方案信息不完整，请返回商品页重新确认');
  }
  const selectedProduct =
    recommendation.primary_product?.sku_id === input.sku_id
      ? recommendation.primary_product
      : recommendation.other_products.find((product) => product.sku_id === input.sku_id);
  if (!selectedProduct) throw new ApiError('没有找到已选择的商品');

  const product =
    'usage' in selectedProduct
      ? selectedProduct
      : {
          sku_id: selectedProduct.sku_id,
          brand: selectedProduct.brand,
          product_name: selectedProduct.product_name,
          shade_name: selectedProduct.shade_name,
          product_type: selectedProduct.product_type,
          is_video_same_product: selectedProduct.is_video_same_product,
          url: selectedProduct.url,
          suitable_reason: selectedProduct.card_reason,
          possible_risk: selectedProduct.possible_risk,
          usage: {
            units_needed: selectedProduct.units_needed,
            units_label: selectedProduct.units_label,
            method: '按商品说明分区使用',
            waiting_minutes: 30,
            short_instruction: '按商品说明完成调配、涂抹和等待。',
          },
          price: {
            unit_price: selectedProduct.unit_price,
            total_price: selectedProduct.total_price,
            currency: selectedProduct.currency,
            collected_at: '2026-07-25',
          },
          purchase_url: selectedProduct.purchase_url,
          purchase_mode: selectedProduct.purchase_mode,
          duration: selectedProduct.duration ?? '维持时间受洗头频率影响',
          official_base_effect: selectedProduct.official_base_effect,
        };

  const createdAt = new Date().toISOString();
  const archiveId = uid('archive');
  const selection = planSelections.get(input.plan_id) ?? {
    route: plan.default_route,
    previewLevel: plan.default_preview_level,
  };
  const detail: ArchiveDetailData = {
    archive_id: archiveId,
    created_at: createdAt,
    purchase_status: input.purchase_status,
    entry_video_id:
      profileEntryStore.get(input.profile_id)?.entryVideoId ?? MOCK_VIDEOS[0].video_id,
    profile_snapshot: {
      current_hair: profile.current_hair,
      target_color: colorWithoutConfidence(profile.target_color),
      hair_length: profile.hair_length,
      hair_volume: profile.hair_volume,
      dye_history: profile.dye_history,
    },
    plan_snapshot: {
      plan_id: plan.plan_id,
      feasibility: plan.feasibility,
      summary: plan.summary,
      reachability_score: plan.reachability_score,
      selected_route: selection.route,
      selected_preview_level: selection.previewLevel,
      default_preview_level: plan.default_preview_level,
      risks: plan.risks,
    },
    product_snapshot: {
      ...product,
      recommendation_id: input.recommendation_id,
    },
    tutorial_video_id: tutorialVideoIdFromEntryVideoId(
      profileEntryStore.get(input.profile_id)?.entryVideoId ?? MOCK_VIDEOS[0].video_id,
    ),
    tutorial_available: true,
    after_video_url: null,
  };
  const archives = loadArchives();
  archives.unshift(detail);
  saveArchives(archives);
  return { archive_id: archiveId, created_at: createdAt };
}

export async function getArchives() {
  if (API_MODE === 'real') {
    return request<ArchiveListData>('/hair-dye-archives');
  }
  await sleep(420);
  return { archives: loadArchives().map(toArchiveSummary) };
}

export async function getArchive(archiveId: string) {
  if (API_MODE === 'real') {
    return request<ArchiveDetailData>(`/hair-dye-archives/${archiveId}`);
  }
  await sleep(380);
  const archive = loadArchives().find((item) => item.archive_id === archiveId);
  if (!archive) throw new ApiError('没有找到这份染发档案');
  return archive;
}

export async function createCompletionRecord(
  tutorialSessionId: string,
  archiveId: string,
  qaSummary: string[],
) {
  if (API_MODE === 'real') {
    return request<CompletionRecord>(
      `/tutorial-sessions/${tutorialSessionId}/completion-record`,
      {
        method: 'POST',
        body: JSON.stringify({ qa_summary: qaSummary }),
      },
    );
  }
  await sleep(260);
  const session = loadSessions()[tutorialSessionId];
  const tutorialSteps = session?.tutorial_steps ?? tutorialStepsForVideoId(session?.tutorial_video.video_id);
  const completionRecord: CompletionRecord = {
    completed_at: new Date().toISOString(),
    total_minutes: Math.max(
      1,
      Math.round(
        tutorialSteps.reduce(
          (total, step) => total + step.end_time_ms - step.start_time_ms,
          0,
        ) / 60000,
      ),
    ),
    completed_steps: tutorialSteps.length,
    total_steps: tutorialSteps.length,
    qa_summary: Array.from(
      new Set(qaSummary.map((item) => qaSummaryStatement(item)).filter(Boolean)),
    ).slice(-4),
    care_notes: [
      '前 48 小时尽量减少洗头。',
      '使用温和、偏凉的水清洗，减少快速掉色。',
      '如头皮出现持续不适，请停止使用并及时咨询专业人士。',
    ],
  };
  const archives = loadArchives();
  const index = archives.findIndex((item) => item.archive_id === archiveId);
  if (index < 0) throw new ApiError('没有找到这份染发档案');
  archives[index] = { ...archives[index], completion_record: completionRecord };
  saveArchives(archives);
  return completionRecord;
}

export async function createTutorialSession(archiveId: string) {
  if (API_MODE === 'real') {
    return request<TutorialSessionData>('/tutorial-sessions', {
      method: 'POST',
      body: JSON.stringify({ archive_id: archiveId }),
    });
  }
  await sleep(540);
  const archive = loadArchives().find((item) => item.archive_id === archiveId);
  const tutorialVideoId = archive?.tutorial_video_id ?? 'tutorial_blue';
  const tutorialMeta = TUTORIAL_VIDEO_META[tutorialVideoId] ?? TUTORIAL_VIDEO_META.tutorial_blue;
  const tutorialSteps = tutorialStepsForVideoId(tutorialVideoId);
  const sessionId = uid('tutorial_session');
  const session: TutorialSessionData = {
    tutorial_session_id: sessionId,
    archive_id: archiveId,
    status: 'active',
    tutorial_video: {
      video_id: tutorialVideoId,
      url: tutorialMeta.url,
      title: tutorialMeta.title,
      color_name: tutorialMeta.color_name,
      brand: tutorialMeta.brand,
      tutorial_type: tutorialMeta.tutorial_type,
    },
    tutorial_steps: tutorialSteps,
    current_step: tutorialSteps[0],
    step_end_tts: {
      text: '你在这一步的操作过程中有什么问题，随时可以问我。',
      audio_url: null,
    },
    completed_step_count: 0,
    awaiting_voice_input: false,
  };
  const sessions = loadSessions();
  sessions[sessionId] = session;
  saveSessions(sessions);
  return session;
}

export async function getTutorialSession(sessionId: string) {
  if (API_MODE === 'real') {
    return request<TutorialSessionData>(`/tutorial-sessions/${sessionId}`);
  }
  await sleep(260);
  const session = loadSessions()[sessionId];
  if (!session) throw new ApiError('教程会话已失效，请从档案重新进入');
  if (!session.tutorial_steps?.length) {
    const tutorialSteps = tutorialStepsForVideoId(session.tutorial_video.video_id);
    session.tutorial_steps = tutorialSteps;
    session.current_step = tutorialSteps.find(
      (step) => step.step_id === session.current_step.step_id,
    ) ?? tutorialSteps[0];
    saveSessions({ ...loadSessions(), [sessionId]: session });
  }
  return session;
}

export async function sendTutorialVoiceInput(
  sessionId: string,
  input: {
    current_step_id: string;
    client_event_id: string;
    audio: File;
  },
) {
  if (API_MODE === 'real') {
    const formData = new FormData();
    formData.append('audio', input.audio);
    formData.append('current_step_id', input.current_step_id);
    formData.append('client_event_id', input.client_event_id);
    return request<TutorialAction>(`/tutorial-sessions/${sessionId}/voice-input`, {
      method: 'POST',
      body: formData,
    });
  }
  await sleep(620);
  const sessions = loadSessions();
  const session = sessions[sessionId];
  if (!session) throw new ApiError('教程会话已失效');
  const isNext = input.audio.name.includes('command-next');
  const isFinish = input.audio.name.includes('command-finish');
  const text = isNext ? '下一步' : isFinish ? '结束了' : '这一步需要注意什么？';
  const tutorialSteps = session.tutorial_steps ?? tutorialStepsForVideoId(session.tutorial_video.video_id);
  const matchedIndex = tutorialSteps.findIndex(
    (step) => step.step_id === input.current_step_id,
  );
  const currentIndex = matchedIndex >= 0 ? matchedIndex : session.current_step.step_no - 1;

  if (isFinish) {
    session.status = 'completed';
    sessions[sessionId] = session;
    saveSessions(sessions);
    return {
      action: 'capture_after_photo',
      asr_transcript: '结束了',
      tts_text: '好的，本次染发教程已结束。我会先为你整理完成记录。',
      tts_audio_url: null,
    } satisfies TutorialAction;
  }

  if (isNext) {
    if (currentIndex >= tutorialSteps.length - 1) {
      session.status = 'completed';
      sessions[sessionId] = session;
      saveSessions(sessions);
      return {
        action: 'capture_after_photo',
        asr_transcript: '下一步',
        tts_text: '全部步骤已经完成。我会先为你整理本次染发记录。',
        tts_audio_url: null,
      } satisfies TutorialAction;
    }
    const nextStep = tutorialSteps[currentIndex + 1];
    session.current_step = nextStep;
    session.step_end_tts = {
      text: '这一步有什么问题，随时可以问我。',
      audio_url: null,
    };
    session.completed_step_count = currentIndex + 1;
    session.last_event_id = input.client_event_id;
    sessions[sessionId] = session;
    saveSessions(sessions);
    return {
      action: 'play_next_step',
      asr_transcript: '下一步',
      current_step: nextStep,
      step_end_tts: {
        text: '这一步有什么问题，随时可以问我。',
        audio_url: null,
      },
    } satisfies TutorialAction;
  }

  const answer =
    '先暂停视频并检查当前步骤说明。如果商品包装上的要求与教程不同，请以商品官方说明为准。';
  return {
    action: 'answer',
    asr_transcript: text,
    tts_text: answer,
    tts_audio_url: null,
    answer: {
      answer_id: 'OP021',
      category: '当前步骤操作问答',
    },
    next_prompt: '处理好后可以说“下一步”，继续后面的操作。',
  } satisfies TutorialAction;
}

export async function submitAfterPhoto(
  tutorialSessionId: string,
  afterImageId: string,
): Promise<AfterPhotoData> {
  if (API_MODE === 'real') {
    return request<AfterPhotoData>(
      `/tutorial-sessions/${tutorialSessionId}/after-photo`,
      {
        method: 'POST',
        body: JSON.stringify({ after_image_id: afterImageId }),
      },
    );
  }
  await sleep(480);
  const idempotencyKey = `${tutorialSessionId}:${afterImageId}`;
  const taskId = afterTaskByImage.get(idempotencyKey) ?? uid('after_video');
  afterTaskByImage.set(idempotencyKey, taskId);
  if (!afterTaskPolls.has(taskId)) afterTaskPolls.set(taskId, 0);
  return {
    generation_task_id: taskId,
    status: 'queued',
    message: '正在排队生成你的染后转场视频。',
  };
}

export async function getAfterVideoTask(taskId: string) {
  if (API_MODE === 'real') {
    return request<AfterVideoTaskData>(`/after-video-tasks/${taskId}`);
  }
  await sleep(260);
  const polls = (afterTaskPolls.get(taskId) ?? 0) + 1;
  afterTaskPolls.set(taskId, polls);
  if (polls < 4) {
    return {
      generation_task_id: taskId,
      status: 'generating',
      progress_percent: Math.min(88, polls * 24),
      message: '正在生成你的染后短视频，请稍候。',
    } satisfies AfterVideoTaskData;
  }
  return {
    generation_task_id: taskId,
    status: 'completed',
    url: '/video-uploads/5c74f7db6af0/video.mp4',
    storage_key: 'mock/generated/after/after_video.mp4',
    cover_url: '/video-mock/frames/step-6-3.jpg',
    cover_storage_key: 'mock/generated/after/after_video_cover.jpg',
  } satisfies AfterVideoTaskData;
}
