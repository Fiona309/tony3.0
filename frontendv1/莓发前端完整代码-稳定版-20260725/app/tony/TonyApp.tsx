'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearFlowDraft,
  createArchive,
  createCompletionRecord,
  createHairProfile,
  createTutorialSession,
  getAfterVideoTask,
  getArchive,
  getArchives,
  getMockVideos,
  getPlanResult,
  getPreviewTask,
  getProductRecommendations,
  getTutorialSession,
  loadFlowDraft,
  saveFlowDraft,
  sendTutorialVoiceInput,
  submitAfterPhoto,
  updateHairProfile,
  uploadImage,
} from './api';
import {
  AfterPhotoScreen,
  AfterVideoScreen,
  ArchiveConfirmScreen,
  ArchiveDetailScreen,
  ArchiveSavedScreen,
  ArchivesScreen,
  CompletionScreen,
  TutorialPrepareScreen,
  TutorialScreen,
} from './archive-tutorial-screens';
import {
  CalculatingScreen,
  CameraScreen,
  DiscoveryScreen,
  PlanScreen,
  ProductsScreen,
  ProfileScreen,
} from './decision-screens';
import type {
  AfterVideoTaskData,
  ArchiveDetailData,
  ArchiveSummary,
  Budget,
  CompletionRecord,
  FlowDraft,
  HairProfileData,
  HairProfileUpdate,
  MockVideo,
  PlanResultData,
  PrimaryProduct,
  ProductRecommendationData,
  PurchaseStatus,
  RouteType,
  TutorialAction,
  TutorialSessionData,
  TutorialStep,
} from './types';

type Screen =
  | 'discover'
  | 'camera'
  | 'profile'
  | 'calculating'
  | 'plan'
  | 'products'
  | 'archiveConfirm'
  | 'archiveSaved'
  | 'archives'
  | 'archiveDetail'
  | 'tutorialPrepare'
  | 'tutorial'
  | 'completion'
  | 'afterPhoto'
  | 'afterVideo';

const TUTORIAL_MAP_STORAGE = 'tony:tutorial-session-by-archive:v1';

function getTutorialMap() {
  if (typeof window === 'undefined') return {} as Record<string, string>;
  try {
    return JSON.parse(
      window.localStorage.getItem(TUTORIAL_MAP_STORAGE) ?? '{}',
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveTutorialMap(map: Record<string, string>) {
  window.localStorage.setItem(TUTORIAL_MAP_STORAGE, JSON.stringify(map));
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export default function TonyApp() {
  const [screen, setScreen] = useState<Screen>('discover');
  const [videos, setVideos] = useState<MockVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [videosError, setVideosError] = useState('');
  const [draft, setDraft] = useState<FlowDraft | null>(null);

  const [selectedVideo, setSelectedVideo] = useState<MockVideo | null>(null);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState('');
  const [currentImageId, setCurrentImageId] = useState('');
  const [profile, setProfile] = useState<HairProfileData | null>(null);
  const [plan, setPlan] = useState<PlanResultData | null>(null);
  const [planStage, setPlanStage] = useState(0);
  const [planError, setPlanError] = useState('');
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewNotice, setPreviewNotice] = useState('');
  const planRequestRef = useRef(0);
  const [selectedRoute, setSelectedRoute] = useState<RouteType>('dye');
  const [selectedPreviewLevel, setSelectedPreviewLevel] = useState(3);
  const [budget, setBudget] = useState<Budget>({
    min_price: 60,
    max_price: 240,
  });
  const [recommendation, setRecommendation] =
    useState<ProductRecommendationData | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState('');
  const [selectedProduct, setSelectedProduct] =
    useState<PrimaryProduct | null>(null);
  const [purchaseStatus, setPurchaseStatus] =
    useState<PurchaseStatus>('saved');
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [archiveSaveError, setArchiveSaveError] = useState('');
  const [savedArchiveId, setSavedArchiveId] = useState('');

  const [archives, setArchives] = useState<ArchiveSummary[]>([]);
  const [archivesLoading, setArchivesLoading] = useState(false);
  const [archivesError, setArchivesError] = useState('');
  const [archiveDetail, setArchiveDetail] =
    useState<ArchiveDetailData | null>(null);
  const [selectedArchiveId, setSelectedArchiveId] = useState('');
  const [archiveDetailLoading, setArchiveDetailLoading] = useState(false);
  const [archiveDetailError, setArchiveDetailError] = useState('');

  const [tutorialStarting, setTutorialStarting] = useState(false);
  const [tutorialError, setTutorialError] = useState('');
  const [tutorialSession, setTutorialSession] =
    useState<TutorialSessionData | null>(null);
  const [offline, setOffline] = useState(false);
  const [completionRecord, setCompletionRecord] =
    useState<CompletionRecord | null>(null);
  const [completionSaved, setCompletionSaved] = useState(false);

  const [afterVideoTask, setAfterVideoTask] =
    useState<AfterVideoTaskData | null>(null);
  const afterPollRef = useRef(0);

  const loadVideos = useCallback(async () => {
    setVideosLoading(true);
    setVideosError('');
    const controller = new AbortController();
    try {
      const data = await getMockVideos(controller.signal);
      setVideos(data.videos);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setVideosError(error instanceof Error ? error.message : '视频加载失败');
    } finally {
      setVideosLoading(false);
    }
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadVideos();
      setDraft(loadFlowDraft());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadVideos]);

  useEffect(() => {
    const updateNetwork = () => setOffline(!navigator.onLine);
    updateNetwork();
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
    };
  }, []);

  const resetDecisionFlow = useCallback(() => {
    planRequestRef.current += 1;
    setSelectedVideo(null);
    setCurrentPhotoUrl('');
    setCurrentImageId('');
    setProfile(null);
    setPlan(null);
    setPlanError('');
    setPreviewProgress(0);
    setPreviewNotice('');
    setSelectedRoute('dye');
    setSelectedPreviewLevel(3);
    setRecommendation(null);
    setRecommendationError('');
    setSelectedProduct(null);
    setPurchaseStatus('saved');
    setSavedArchiveId('');
  }, []);

  const openDiscover = () => {
    resetDecisionFlow();
    setScreen('discover');
  };

  const startFromVideo = (video: MockVideo) => {
    setSelectedVideo(video);
    setCurrentPhotoUrl('');
    setProfile(null);
    setPlan(null);
    setRecommendation(null);
    setScreen('camera');
  };

  const resumeDraft = () => {
    if (!draft) return;
    setSelectedVideo(draft.video);
    setCurrentPhotoUrl(draft.currentPhotoUrl);
    setCurrentImageId(draft.currentImageId);
    setProfile(draft.profile);
    setPlan(null);
    setRecommendation(null);
    setScreen('profile');
  };

  const handleUsePhoto = async (file: File, previewUrl: string) => {
    if (!selectedVideo) throw new Error('目标发色已经失效，请返回视频重新选择');
    const uploaded = await uploadImage(file, 'current_hair');
    const recognized = await createHairProfile({
      entry_video_id: selectedVideo.video_id,
      current_image_id: uploaded.image_id,
    });
    setCurrentPhotoUrl(previewUrl);
    setCurrentImageId(uploaded.image_id);
    setProfile(recognized);
    setScreen('profile');
  };

  const pollPreviewTask = useCallback(
    async (previewTaskId: string, requestId: number) => {
      const maxAttempts = 66;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        await wait(attempt <= 15 ? 2000 : 5000);
        if (planRequestRef.current !== requestId) return;
        try {
          const task = await getPreviewTask(previewTaskId);
          if (planRequestRef.current !== requestId) return;
          if (task.status === 'queued' || task.status === 'generating') {
            setPreviewProgress(task.progress_percent);
            setPreviewNotice(
              task.elapsed_seconds >= 30
                ? '效果图仍在生成中。你可以先选择商品，完成后会自动更新。'
                : '',
            );
            continue;
          }
          setPlan((current) =>
            current
              ? {
                  ...current,
                  preview_status: task.status,
                  preview_images: task.preview_images,
                }
              : current,
          );
          setPreviewProgress(100);
          setPreviewNotice(
            task.status === 'fallback' ? task.fallback_message : '',
          );
          return;
        } catch {
          if (attempt < maxAttempts) continue;
        }
      }
      if (planRequestRef.current !== requestId) return;
      setPreviewNotice('效果图仍在后台生成。你可以继续选择商品，稍后回到方案页查看。');
    },
    [],
  );

  const calculatePlan = useCallback(
    async (profileId: string) => {
      const requestId = planRequestRef.current + 1;
      planRequestRef.current = requestId;
      setScreen('calculating');
      setPlanError('');
      setPlanStage(0);
      setPreviewProgress(0);
      setPreviewNotice('');
      const timers = [
        window.setTimeout(() => setPlanStage(1), 460),
        window.setTimeout(() => setPlanStage(2), 900),
      ];
      try {
        const result = await getPlanResult(profileId);
        if (planRequestRef.current !== requestId) return;
        setPlan(result);
        setSelectedRoute(result.default_route);
        setSelectedPreviewLevel(result.default_preview_level);
        setRecommendation(null);
        await wait(260);
        if (planRequestRef.current === requestId) {
          setScreen('plan');
          if (
            (result.preview_status === 'queued' ||
              result.preview_status === 'generating') &&
            result.preview_task_id
          ) {
            void pollPreviewTask(result.preview_task_id, requestId);
          }
        }
      } catch (error) {
        if (planRequestRef.current !== requestId) return;
        setPlanError(error instanceof Error ? error.message : '方案计算失败');
      } finally {
        timers.forEach((timer) => window.clearTimeout(timer));
      }
    },
    [pollPreviewTask],
  );

  const handleConfirmProfile = async (update: HairProfileUpdate) => {
    if (!profile || !selectedVideo) throw new Error('识别信息已经失效');
    await updateHairProfile(profile.profile_id, update);
    const confirmed: HairProfileData = {
      ...profile,
      ...update,
      status: 'confirmed',
    };
    setProfile(confirmed);
    const nextDraft: FlowDraft = {
      profile: confirmed,
      video: selectedVideo,
      currentImageId,
      currentPhotoUrl,
      savedAt: new Date().toISOString(),
    };
    saveFlowDraft(nextDraft);
    setDraft(nextDraft);
    await calculatePlan(profile.profile_id);
  };

  const backFromCalculating = () => {
    planRequestRef.current += 1;
    setPlanError('');
    setScreen('profile');
  };

  const openProducts = () => {
    setRecommendation(null);
    setRecommendationError('');
    setScreen('products');
  };

  const recommendProducts = async () => {
    if (!profile || !plan) return;
    setRecommendationLoading(true);
    setRecommendationError('');
    try {
      const result = await getProductRecommendations({
        profile_id: profile.profile_id,
        plan_id: plan.plan_id,
        selected_route: selectedRoute,
        selected_preview_level: selectedPreviewLevel,
        budget,
      });
      setRecommendation(result);
    } catch (error) {
      setRecommendationError(
        error instanceof Error ? error.message : '商品推荐失败',
      );
    } finally {
      setRecommendationLoading(false);
    }
  };

  const confirmProduct = (
    product: PrimaryProduct,
    status: PurchaseStatus,
  ) => {
    setSelectedProduct(product);
    setPurchaseStatus(status);
    setArchiveSaveError('');
    setScreen('archiveConfirm');
  };

  const saveArchive = async () => {
    if (!profile || !plan || !recommendation || !selectedProduct) return;
    setArchiveSaving(true);
    setArchiveSaveError('');
    try {
      const result = await createArchive({
        profile_id: profile.profile_id,
        plan_id: plan.plan_id,
        recommendation_id: recommendation.recommendation_id,
        sku_id: selectedProduct.sku_id,
        purchase_status: purchaseStatus,
      });
      setSavedArchiveId(result.archive_id);
      clearFlowDraft();
      setDraft(null);
      setScreen('archiveSaved');
    } catch (error) {
      setArchiveSaveError(
        error instanceof Error ? error.message : '档案保存失败',
      );
    } finally {
      setArchiveSaving(false);
    }
  };

  const openArchives = useCallback(async () => {
    setScreen('archives');
    setArchivesLoading(true);
    setArchivesError('');
    try {
      const data = await getArchives();
      setArchives(data.archives);
    } catch (error) {
      setArchivesError(error instanceof Error ? error.message : '档案加载失败');
    } finally {
      setArchivesLoading(false);
    }
  }, []);

  const openArchiveDetail = useCallback(async (archiveId: string) => {
    setSelectedArchiveId(archiveId);
    setScreen('archiveDetail');
    setArchiveDetail(null);
    setArchiveDetailLoading(true);
    setArchiveDetailError('');
    try {
      const detail = await getArchive(archiveId);
      setArchiveDetail(detail);
    } catch (error) {
      setArchiveDetailError(
        error instanceof Error ? error.message : '档案详情加载失败',
      );
    } finally {
      setArchiveDetailLoading(false);
    }
  }, []);

  const openTutorialPrepare = () => {
    if (!archiveDetail) return;
    if (archiveDetail.completion_record) {
      setCompletionRecord(archiveDetail.completion_record);
      setCompletionSaved(true);
      setScreen('completion');
      return;
    }
    setTutorialError('');
    setScreen('tutorialPrepare');
  };

  const startTutorial = async () => {
    if (!archiveDetail) return;
    setTutorialStarting(true);
    setTutorialError('');
    try {
      const sessionMap = getTutorialMap();
      let session: TutorialSessionData | null = null;
      const existingSessionId = sessionMap[archiveDetail.archive_id];
      if (existingSessionId) {
        try {
          session = await getTutorialSession(existingSessionId);
        } catch {
          session = null;
        }
      }
      if (!session || session.status === 'completed') {
        session = await createTutorialSession(archiveDetail.archive_id);
        sessionMap[archiveDetail.archive_id] = session.tutorial_session_id;
        saveTutorialMap(sessionMap);
      }
      setTutorialSession(session);
      setCompletionRecord(null);
      setCompletionSaved(Boolean(archiveDetail.completion_record));
      setScreen('tutorial');
    } catch (error) {
      setTutorialError(
        error instanceof Error ? error.message : '教程启动失败',
      );
    } finally {
      setTutorialStarting(false);
    }
  };

  const sendTutorialMessage = async (audio: File): Promise<TutorialAction> => {
    if (!tutorialSession) throw new Error('教程会话已经失效');
    return sendTutorialVoiceInput(tutorialSession.tutorial_session_id, {
      current_step_id: tutorialSession.current_step.step_id,
      client_event_id: window.crypto.randomUUID(),
      audio,
    });
  };

  const updateTutorialStep = (
    step: TutorialStep,
    stepEndTTS?: TutorialSessionData['step_end_tts'],
  ) => {
    setTutorialSession((current) =>
      current
        ? {
            ...current,
            current_step: step,
            step_end_tts: stepEndTTS ?? current.step_end_tts,
            completed_step_count: Math.max(0, step.step_no - 1),
          }
        : current,
    );
  };

  const completeTutorial = async (qaSummary: string[] = []) => {
    if (!archiveDetail || !tutorialSession) return;
    const record = await createCompletionRecord(
      tutorialSession.tutorial_session_id,
      archiveDetail.archive_id,
      qaSummary,
    );
    setCompletionRecord(record);
    setArchiveDetail({
      ...archiveDetail,
      completion_record: record,
    });
    setCompletionSaved(true);
    setScreen('completion');
  };

  const saveCompletion = () => {
    if (!archiveDetail || !completionRecord) return;
    setArchiveDetail({
      ...archiveDetail,
      completion_record: completionRecord,
    });
    setCompletionSaved(true);
  };

  const pollAfterVideo = useCallback(async (taskId: string) => {
    const pollGeneration = afterPollRef.current + 1;
    afterPollRef.current = pollGeneration;
    for (let index = 0; index < 240; index += 1) {
      if (afterPollRef.current !== pollGeneration) return;
      if (index > 0) await wait(2000);
      if (afterPollRef.current !== pollGeneration) return;
      try {
        const task = await getAfterVideoTask(taskId);
        setAfterVideoTask(task);
        if (task.status !== 'generating') return;
      } catch (error) {
        setAfterVideoTask({
          generation_task_id: taskId,
          status: 'failed',
          error_message: error instanceof Error ? error.message : '生成任务查询失败',
          fallback_message:
            '视频生成状态暂时无法获取，你的教程完成记录不受影响。',
        });
        return;
      }
    }
    setAfterVideoTask({
      generation_task_id: taskId,
      status: 'failed',
      error_message: 'poll_timeout',
      fallback_message: '生成时间较长，请稍后在档案中查看。',
    });
  }, []);

  const submitAfterPhotoFlow = async (file: File) => {
    if (!tutorialSession) throw new Error('教程会话已经失效');
    const uploaded = await uploadImage(file, 'after_hair');
    const submitted = await submitAfterPhoto(
      tutorialSession.tutorial_session_id,
      uploaded.image_id,
    );
    if (submitted.status === 'completed' && submitted.url) {
      setAfterVideoTask({
        generation_task_id: submitted.generation_task_id,
        status: 'completed',
        url: submitted.url,
        storage_key: submitted.storage_key ?? '',
        cover_url: submitted.cover_url ?? uploaded.url,
        cover_storage_key: submitted.cover_storage_key ?? '',
      });
      setScreen('afterVideo');
      return;
    }
    if (submitted.status === 'failed') {
      setAfterVideoTask({
        generation_task_id: submitted.generation_task_id,
        status: 'failed',
        error_message: submitted.error_message ?? 'transition_video_generation_failed',
        fallback_message:
          submitted.fallback_message ??
          '转场视频生成失败，可稍后重试；你的教程完成记录不受影响。',
      });
      setScreen('afterVideo');
      return;
    }
    const generating: AfterVideoTaskData = {
      generation_task_id: submitted.generation_task_id,
      status: 'generating',
      progress_percent: 8,
      message: submitted.message ?? '正在生成你的染后转场视频，请稍候。',
    };
    setAfterVideoTask(generating);
    setScreen('afterVideo');
    void pollAfterVideo(submitted.generation_task_id);
  };

  if (screen === 'discover') {
    return (
      <DiscoveryScreen
        videos={videos}
        loading={videosLoading}
        error={videosError}
        draft={draft}
        onRetry={() => void loadVideos()}
        onStart={startFromVideo}
        onOpenArchives={() => void openArchives()}
        onResumeDraft={resumeDraft}
      />
    );
  }

  if (screen === 'camera' && selectedVideo) {
    return (
      <CameraScreen
        target={selectedVideo}
        onBack={() => setScreen('discover')}
        onUsePhoto={handleUsePhoto}
      />
    );
  }

  if (screen === 'profile' && selectedVideo && profile) {
    return (
      <ProfileScreen
        key={`${profile.profile_id}-${profile.status}`}
        initialProfile={profile}
        currentPhotoUrl={currentPhotoUrl}
        target={selectedVideo}
        onBack={() => setScreen('camera')}
        onConfirm={handleConfirmProfile}
      />
    );
  }

  if (screen === 'calculating') {
    return (
      <CalculatingScreen
        currentStage={planStage}
        error={planError}
        onRetry={() => {
          if (profile) void calculatePlan(profile.profile_id);
        }}
        onBack={backFromCalculating}
      />
    );
  }

  if (screen === 'plan' && plan && selectedVideo) {
    return (
      <PlanScreen
        plan={plan}
        selectedRoute={selectedRoute}
        selectedPreviewLevel={selectedPreviewLevel}
        previewProgress={previewProgress}
        previewNotice={previewNotice}
        onRouteChange={(route) => {
          setSelectedRoute(route);
          setRecommendation(null);
        }}
        onPreviewLevelChange={(previewLevel) => {
          setSelectedPreviewLevel(previewLevel);
          setRecommendation(null);
        }}
        onBack={() => setScreen('profile')}
        onProducts={openProducts}
      />
    );
  }

  if (screen === 'products' && selectedVideo) {
    return (
      <ProductsScreen
        target={selectedVideo}
        route={selectedRoute}
        budget={budget}
        recommendation={recommendation}
        loading={recommendationLoading}
        error={recommendationError}
        onBudgetChange={setBudget}
        onRecommend={() => void recommendProducts()}
        onBack={() => setScreen('plan')}
        onContinue={confirmProduct}
      />
    );
  }

  if (
    screen === 'archiveConfirm' &&
    profile &&
    plan &&
    selectedProduct &&
    selectedVideo
  ) {
    return (
      <ArchiveConfirmScreen
        profile={profile}
        plan={plan}
        product={selectedProduct}
        purchaseStatus={purchaseStatus}
        currentPhotoUrl={currentPhotoUrl}
        target={selectedVideo}
        saving={archiveSaving}
        error={archiveSaveError}
        onBack={() => setScreen('products')}
        onSave={() => void saveArchive()}
      />
    );
  }

  if (screen === 'archiveSaved') {
    return (
      <ArchiveSavedScreen
        targetName={profile?.target_color.display_name ?? '染发方案'}
        onArchives={() => void openArchives()}
        onBackToVideos={openDiscover}
      />
    );
  }

  if (screen === 'archives') {
    return (
      <ArchivesScreen
        archives={archives}
        loading={archivesLoading}
        error={archivesError}
        onBack={() => setScreen('discover')}
        onRetry={() => void openArchives()}
        onSelect={(archiveId) => void openArchiveDetail(archiveId)}
        onNew={openDiscover}
      />
    );
  }

  if (screen === 'archiveDetail') {
    return (
      <ArchiveDetailScreen
        archive={archiveDetail}
        loading={archiveDetailLoading}
        error={archiveDetailError}
        onBack={() => void openArchives()}
        onRetry={() => {
          if (selectedArchiveId) {
            void openArchiveDetail(selectedArchiveId);
          } else if (savedArchiveId) {
            void openArchiveDetail(savedArchiveId);
          }
        }}
        onStartTutorial={openTutorialPrepare}
      />
    );
  }

  if (screen === 'tutorialPrepare' && archiveDetail) {
    return (
      <TutorialPrepareScreen
        archive={archiveDetail}
        starting={tutorialStarting}
        error={tutorialError}
        onBack={() => setScreen('archiveDetail')}
        onStart={() => void startTutorial()}
      />
    );
  }

  if (screen === 'tutorial' && tutorialSession) {
    return (
      <TutorialScreen
        session={tutorialSession}
        offline={offline}
        onBack={() => {
          const confirmed = window.confirm('退出教程吗？当前步骤会保留在档案中。');
          if (confirmed) setScreen('archiveDetail');
        }}
        onSend={sendTutorialMessage}
        onSessionStep={updateTutorialStep}
        onComplete={completeTutorial}
      />
    );
  }

  if (screen === 'completion' && archiveDetail && completionRecord) {
    return (
      <CompletionScreen
        archive={archiveDetail}
        record={completionRecord}
        saved={completionSaved}
        onSave={saveCompletion}
        onArchives={() => void openArchives()}
        onTransitionVideo={() => setScreen('afterPhoto')}
      />
    );
  }

  if (screen === 'afterPhoto') {
    return (
      <AfterPhotoScreen
        onBack={() => setScreen('completion')}
        onUse={async (file) => submitAfterPhotoFlow(file)}
      />
    );
  }

  if (screen === 'afterVideo' && afterVideoTask) {
    return (
      <AfterVideoScreen
        task={afterVideoTask}
        onBack={() => setScreen('completion')}
        onRetry={() => {
          afterPollRef.current += 1;
          setAfterVideoTask(null);
          setScreen('afterPhoto');
        }}
      />
    );
  }

  return (
    <DiscoveryScreen
      videos={videos}
      loading={videosLoading}
      error={videosError}
      draft={draft}
      onRetry={() => void loadVideos()}
      onStart={startFromVideo}
      onOpenArchives={() => void openArchives()}
      onResumeDraft={resumeDraft}
    />
  );
}
