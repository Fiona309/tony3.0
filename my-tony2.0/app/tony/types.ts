export type ApiMode = 'mock' | 'real';

export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  trace_id: string;
}

export type RouteType = 'dye' | 'color_deposit';
export type Feasibility =
  | 'reachable'
  | 'conditional'
  | 'approximate'
  | 'not_reachable'
  | 'salon_required'
  | 'unknown';
export type RiskSeverity = 'low' | 'medium' | 'high';
export type PurchaseStatus = 'purchased' | 'simulated' | 'saved';
export type HairProfileStatus = 'need_confirm' | 'confirmed' | 'failed';
export type RegionMode = 'single' | 'root_mid_end';

export interface MockVideo {
  video_id: string;
  title: string;
  video_type: 'dye_related' | 'non_dye' | 'unknown';
  url: string;
  cover_url: string;
  target_frame_url: string;
  trigger_time_ms: number;
  color_name: string;
  color_alias?: string;
  accent?: string;
  /** 该视频的目标发色。试色屏换色后要写回画像，所以必须是完整的 HairColor */
  target_color?: HairColor;
  bound_product_id?: string;
  bound_tutorial_video_id?: string;
}

export interface MockVideosData {
  videos: MockVideo[];
}

export interface MediaImageData {
  image_id: string;
  media_type: 'current_hair' | 'after_hair';
  storage_key: string;
  url: string;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSV {
  h: number;
  s: number;
  v: number;
}

export interface LAB {
  l: number;
  a: number;
  b: number;
}

export interface HairColor {
  tone: string;
  level: number;
  saturation: 'light' | 'medium' | 'dark';
  display_name: string;
  rgb?: RGB;
  hsv?: HSV;
  lab?: LAB;
  confidence?: number;
}

export interface HairRegion {
  color: HairColor;
  color_options?: HairColor[];
}

export interface CurrentHair {
  region_mode: RegionMode;
  color?: HairColor;
  color_options?: HairColor[];
  regions?: {
    root: HairRegion;
    mid: HairRegion;
    end: HairRegion;
  };
}

export interface EditableOption {
  value: string;
  label: string;
}

export interface EditableOptions {
  hair_length: EditableOption[];
  hair_volume: EditableOption[];
  dye_history: EditableOption[];
}

export interface HairProfileData {
  profile_id: string;
  status: HairProfileStatus;
  vision_error?: string;
  vision_debug?: unknown;
  demo_mode?: boolean;
  source_profile_id?: string;
  target_color: HairColor;
  target_color_options?: HairColor[];
  current_hair: CurrentHair;
  hair_length: string;
  hair_volume: string;
  dye_history: string;
  attribute_confidences?: {
    hair_length?: number;
    hair_volume?: number;
    dye_history?: number;
    current_color?: number;
    target_color?: number;
  };
  editable_options: EditableOptions;
}

export interface HairProfileUpdate {
  target_color?: HairColor;
  current_hair: CurrentHair;
  hair_length: string;
  hair_volume: string;
  dye_history: string;
}

export interface HairProfileConfirmationData {
  profile_id: string;
  status: 'confirmed';
}

export interface RiskItem {
  title: string;
  severity: RiskSeverity;
  reason: string;
  suggestion: string;
}

export interface PreviewImage {
  preview_level: number;
  label: string;
  url: string;
  storage_key?: string;
  enabled: boolean;
}

export interface OfficialResultColor {
  rgb: RGB;
  hex: string;
  rgb_quality: string;
}

export interface ColorRule {
  source?: string;
  matched_color_name?: string;
  primary_tone?: string;
  current_level?: number;
  matrix_color_id?: string;
  result_quality: 'normal' | 'biased' | 'not_recommended' | 'unknown';
  recommended?: boolean;
  official_result_color?: OfficialResultColor | null;
}

export interface RouteCard {
  route: RouteType;
  title: string;
  recommended: boolean;
  reason: string;
}

export interface PlanResultData {
  profile_id: string;
  plan_id: string;
  feasibility: Feasibility;
  summary: string;
  reachability_score: number;
  risks: RiskItem[];
  preview_status: 'queued' | 'generating' | 'completed' | 'fallback';
  preview_task_id?: string;
  preview_images: PreviewImage[];
  preview_labels: Record<string, string>;
  route_cards: RouteCard[];
  default_route: RouteType;
  default_preview_level: number;
  can_recommend_product: boolean;
  color_rule?: ColorRule;
}

export type PreviewTaskData =
  | {
      preview_task_id: string;
      status: 'queued' | 'generating';
      progress_percent: number;
      elapsed_seconds?: number;
      preview_images: PreviewImage[];
    }
  | {
      preview_task_id: string;
      status: 'completed';
      elapsed_seconds?: number;
      preview_images: PreviewImage[];
    }
  | {
      preview_task_id: string;
      status: 'fallback';
      elapsed_seconds?: number;
      preview_images: PreviewImage[];
      fallback_message: string;
    };

export interface ProductUsage {
  units_needed: number;
  units_label: string;
  method: string;
  waiting_minutes: number | null;
  short_instruction: string;
  quantity_policy?: string;
  is_estimate?: boolean;
  evidence_path?: string;
  difficulty?: number;
  hair_state?: 'dry' | 'wet' | 'dry_or_wet';
  key_steps?: string[];
  image_urls?: string[];
}

export interface ProductPrice {
  unit_price: number;
  total_price: number;
  currency: string;
  collected_at: string;
  selected_spec?: string;
  evidence_path?: string;
}

export type PurchaseMode = 'external_link' | 'mock' | 'douyin_link_pending';

export interface PrimaryProduct {
  sku_id: string;
  brand: string;
  product_name: string;
  shade_name: string;
  product_type: RouteType | string;
  badge?: string;
  is_video_same_product: boolean;
  url: string;
  suitable_reason: string;
  possible_risk: string;
  usage: ProductUsage;
  price: ProductPrice;
  purchase_url: string | null;
  purchase_mode: PurchaseMode;
  purchase_channel?: string;
  aliases?: string;
  base_levels?: string;
  duration: string;
  official_base_effect?: string;
  color_rule_risk?: {
    result_quality: ColorRule['result_quality'];
    matched_color_name?: string;
    current_level?: number;
    matrix_color_id?: string;
    official_result_color?: OfficialResultColor | null;
    risk_reason: string;
    suggestion: string;
  };
}

export interface OtherProduct {
  sku_id: string;
  brand: string;
  product_name: string;
  shade_name: string;
  product_type: RouteType | string;
  is_video_same_product: boolean;
  url: string;
  card_reason: string;
  possible_risk: string;
  units_needed: number;
  units_label: string;
  unit_price: number;
  total_price: number;
  currency: string;
  purchase_url: string | null;
  purchase_mode: PurchaseMode;
  purchase_channel?: string;
  aliases?: string;
  base_levels?: string;
  duration?: string;
  official_base_effect?: string;
}

export interface ProductRecommendationData {
  profile_id: string;
  plan_id: string;
  recommendation_id: string;
  status: 'available' | 'no_match';
  selected_route: RouteType;
  risk_level?: RiskSeverity;
  risk_summary?: string;
  color_rule?: ColorRule;
  primary_product: PrimaryProduct | null;
  other_products: OtherProduct[];
  message?: string;
}

export interface Budget {
  min_price: number;
  max_price: number;
}

export interface ArchiveCreateData {
  archive_id: string;
  created_at: string;
}

export interface ArchiveSummary {
  archive_id: string;
  target_color_name: string;
  current_color_name: string;
  product_name: string;
  shade_name: string;
  purchase_status: PurchaseStatus;
  created_at: string;
  tutorial_available: boolean;
  status?: 'saved' | 'ready' | 'in_progress' | 'completed';
  current_step_no?: number;
  total_steps?: number;
}

export interface ArchiveListData {
  archives: ArchiveSummary[];
}

export interface ArchiveDetailData {
  archive_id: string;
  created_at: string;
  purchase_status: PurchaseStatus;
  entry_video_id: string;
  current_image_id?: string;
  current_image_url?: string | null;
  selected_preview_image_url?: string | null;
  profile_snapshot: {
    current_hair: CurrentHair;
    target_color: HairColor;
    hair_length: string;
    hair_volume: string;
    dye_history: string;
  };
  plan_snapshot: {
    plan_id: string;
    feasibility: Feasibility;
    summary: string;
    reachability_score: number;
    selected_route: RouteType;
    selected_preview_level: number;
    default_preview_level: number;
    risks: RiskItem[];
  };
  product_snapshot: PrimaryProduct & {
    recommendation_id: string;
  };
  tutorial_video_id: string;
  tutorial_available: boolean;
  after_video_url: string | null;
  completion_record?: CompletionRecord;
}

export interface TutorialVideo {
  video_id: string;
  url: string;
  title?: string;
  color_name?: string;
  brand?: string;
  tutorial_type?: string;
}

export interface TutorialStep {
  step_id: string;
  step_no: number;
  total_steps: number;
  start_time_ms: number;
  end_time_ms: number;
  title: string;
  description: string;
  points?: string[];
  caution?: string;
  wait_seconds?: number;
  display_time_range?: string;
  source?: string;
}

export interface StepEndTTS {
  text: string;
  audio_url: string | null;
}

export interface TutorialSessionData {
  tutorial_session_id: string;
  archive_id?: string;
  status?: 'active' | 'completed' | 'aborted';
  tutorial_video: TutorialVideo;
  tutorial_steps?: TutorialStep[];
  current_step: TutorialStep;
  step_end_tts?: StepEndTTS;
  awaiting_voice_input?: boolean;
  last_event_id?: string | null;
  completed_step_count?: number;
}

export type TutorialAction =
  | {
      action: 'answer';
      asr_transcript?: string;
      tts_text: string;
      tts_audio_url?: string | null;
      answer: {
        answer_id: string;
        category: string;
        matched_query?: string;
        score?: number;
        source?: string;
      };
      next_prompt: string;
    }
  | {
      action: 'play_next_step';
      asr_transcript?: string;
      current_step: TutorialStep;
      step_end_tts?: StepEndTTS;
    }
  | {
      action: 'replay_current_step';
      asr_transcript?: string;
      current_step: TutorialStep;
      tts_text: string;
      tts_audio_url?: string | null;
    }
  | {
      action: 'capture_after_photo';
      asr_transcript?: string;
      tts_text: string;
      tts_audio_url?: string | null;
    }
  | {
      action: 'silence';
      asr_transcript?: string;
      tts_text: string;
      tts_audio_url?: string | null;
    };

export interface CompletionRecord {
  completed_at: string;
  total_minutes: number;
  completed_steps: number;
  total_steps: number;
  qa_summary: string[];
  care_notes: string[];
}

export interface AfterPhotoData {
  generation_task_id: string;
  status: 'queued' | 'generating' | 'completed' | 'failed';
  message?: string;
  url?: string;
  storage_key?: string;
  cover_url?: string;
  cover_storage_key?: string;
  error_message?: string;
  fallback_message?: string;
}

export type AfterVideoTaskData =
  | {
      generation_task_id: string;
      status: 'generating';
      progress_percent: number;
      message: string;
    }
  | {
      generation_task_id: string;
      status: 'completed';
      url: string;
      storage_key?: string;
      cover_url: string;
      cover_storage_key?: string;
    }
  | {
      generation_task_id: string;
      status: 'failed';
      error_message: string;
      fallback_message: string;
    };

export interface FlowDraft {
  profile: HairProfileData;
  video: MockVideo;
  currentImageId: string;
  currentPhotoUrl: string;
  savedAt: string;
}
