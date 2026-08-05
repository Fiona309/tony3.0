'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearFlowDraft,
  createArchive,
  createCompletionRecord,
  createDemoProfile,
  createHairProfile,
  createTutorialSession,
  getAfterVideoTask,
  getArchive,
  getArchives,
  getColorMatrix,
  getMockVideos,
  getPlanResult,
  getPreviewTask,
  getProductRecommendations,
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
import { HairMirror } from './hair-mirror';
import type { ColorMatrix } from './hair-mirror-core';
import { LandingScreen, ReturnHomeScreen } from './home-screens';
import { OperationPreviewScreen } from './operation-preview-screen';
import {
  AgentShell,
  MyScreen,
  ShopHubScreen,
  TutorialHubScreen,
  type MainTab,
} from './main-tabs';
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
  | 'landing'
  | 'home'
  | 'discover'
  | 'camera'
  | 'profile'
  | 'mirror'
  | 'calculating'
  | 'plan'
  | 'products'
  | 'operationPreview'
  | 'archiveConfirm'
  | 'archiveSaved'
  | 'archives'
  | 'archiveDetail'
  | 'tutorial'
  | 'completion'
  | 'afterPhoto'
  | 'afterVideo'
  | 'shopHub'
  | 'tutorialHub'
  | 'me';

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
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState('');
  const [colorMatrix, setColorMatrix] = useState<ColorMatrix | null>(null);
  const [mirrorLevel, setMirrorLevel] = useState(5);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewNotice, setPreviewNotice] = useState('');
  const planRequestRef = useRef(0);
  const [selectedRoute, setSelectedRoute] = useState<RouteType>('dye');
  const [selectedIntensity, setSelectedIntensity] = useState(3);
  const [budget, setBudget] = useState<Budget>({
    min_price: 40,
    max_price: 80,
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
      const savedDraft = loadFlowDraft();
      setDraft(savedDraft);
      void getArchives()
        .then((data) => {
          setArchives(data.archives);
          const params = new URLSearchParams(window.location.search);
          const externalEntry =
            params.get('entry') === 'douyin' || Boolean(params.get('video_id'));
          setScreen(
            externalEntry || (!savedDraft && data.archives.length === 0)
              ? 'discover'
              : 'home',
          );
        })
        .catch(() => undefined);
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
    setSelectedIntensity(3);
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

  const openHome = () => {
    resetDecisionFlow();
    setScreen('home');
  };

  const changeMainTab = (tab: MainTab) => {
    if (tab === 'analysis') setScreen('home');
    if (tab === 'shop') setScreen(plan && selectedVideo ? 'products' : 'shopHub');
    if (tab === 'tutorial') setScreen('tutorialHub');
    if (tab === 'me') setScreen('me');
  };

  const openLandingFromVideo = (video: MockVideo) => {
    setSelectedVideo(video);
    setCurrentPhotoUrl('');
    setProfile(null);
    setPlan(null);
    setRecommendation(null);
    setScreen('landing');
  };

  const startCameraFromLanding = (video: MockVideo) => {
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
      const startedAt = Date.now();
      while (Date.now() - startedAt < 300_000) {
        const elapsed = Date.now() - startedAt;
        await wait(elapsed < 30_000 ? 2000 : 5000);
        if (planRequestRef.current !== requestId) return;
        try {
          const task = await getPreviewTask(previewTaskId);
          if (planRequestRef.current !== requestId) return;
          if (task.status === 'queued' || task.status === 'generating') {
            setPreviewProgress(task.progress_percent);
            if (Date.now() - startedAt >= 30_000) {
              setPreviewNotice(
                '效果图仍在后台生成，你可以先选择方案和商品，完成后会自动展示。',
              );
            }
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
          continue;
        }
      }
      if (planRequestRef.current !== requestId) return;
      setPreviewNotice(
        '效果图仍在生成，本次会话已暂停主动轮询；可以先按推荐档位继续。',
      );
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
        setSelectedIntensity(result.default_preview_level);
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

  const handleDemoPreview = useCallback(async () => {
    if (!profile || !selectedVideo) return;
    setDemoLoading(true);
    setDemoError('');
    try {
      const demoProfile = await createDemoProfile({
        source_profile_id: profile.source_profile_id ?? profile.profile_id,
        entry_video_id: selectedVideo.video_id,
      });
      setProfile(demoProfile);
      const nextDraft: FlowDraft = {
        profile: demoProfile,
        video: selectedVideo,
        currentImageId,
        currentPhotoUrl,
        savedAt: new Date().toISOString(),
      };
      saveFlowDraft(nextDraft);
      setDraft(nextDraft);
      setRecommendation(null);
      setSelectedProduct(null);
      await calculatePlan(demoProfile.profile_id);
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : '演示方案生成失败，请稍后再试');
    } finally {
      setDemoLoading(false);
    }
  }, [calculatePlan, currentImageId, currentPhotoUrl, profile, selectedVideo]);

  const handleConfirmProfile = async (update: HairProfileUpdate) => {
    if (!profile || !selectedVideo) throw new Error('识别信息已经失效');
    setDemoError('');
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

    // B 方案：先进实时试色，用户接受风险后才调 getPlanResult。
    // 后端"调用 plan-result 即触发生图"，所以推迟调用 = 只有高意向用户才花那一张生图的钱。
    const level = confirmed.current_hair?.color?.level;
    if (typeof level === 'number') setMirrorLevel(level);
    if (!colorMatrix) {
      void getColorMatrix()
        .then(setColorMatrix)
        .catch(() => setColorMatrix(null));
    }
    setScreen('mirror');
  };

  const backFromCalculating = () => {
    planRequestRef.current += 1;
    setPlanError('');
    setScreen('mirror');
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
        selected_preview_level: selectedIntensity,
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
    setScreen('operationPreview');
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
        selected_route: selectedRoute,
        selected_preview_level: selectedIntensity,
      });
      setSavedArchiveId(result.archive_id);
      const [archiveDetailData, archiveListData] = await Promise.all([
        getArchive(result.archive_id),
        getArchives(),
      ]);
      setSelectedArchiveId(result.archive_id);
      setArchiveDetail(archiveDetailData);
      setArchives(archiveListData.archives);
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

  const startTutorial = async () => {
    if (!archiveDetail) return;
    setTutorialStarting(true);
    setTutorialError('');
    try {
      const session = await createTutorialSession(archiveDetail.archive_id);
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
    try {
      const savedRecord = await createCompletionRecord(
        tutorialSession.tutorial_session_id,
        archiveDetail.archive_id,
        qaSummary,
      );
      setCompletionRecord(savedRecord);
      setArchiveDetail({
        ...archiveDetail,
        completion_record: savedRecord,
      });
      setCompletionSaved(true);
      setScreen('completion');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '完成记录保存失败');
    }
  };

  const saveCompletion = async () => {
    if (!archiveDetail || !completionRecord) return;
    if (!tutorialSession) return;
    try {
      const savedRecord = await createCompletionRecord(
        tutorialSession.tutorial_session_id,
        archiveDetail.archive_id,
        completionRecord.qa_summary,
      );
      setCompletionRecord(savedRecord);
      setArchiveDetail({
        ...archiveDetail,
        completion_record: savedRecord,
      });
      setCompletionSaved(true);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '完成记录保存失败');
    }
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
    if (!archiveDetail) throw new Error('档案详情已经失效');
    let activeSession = tutorialSession;
    if (!activeSession) {
      activeSession = await createTutorialSession(archiveDetail.archive_id);
      setTutorialSession(activeSession);
    }
    const uploaded = await uploadImage(file, 'after_hair');
    const submitted = await submitAfterPhoto(
      activeSession.tutorial_session_id,
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
        onRetry={() => void loadVideos()}
        onStart={openLandingFromVideo}
        onOpenArchives={() => void openArchives()}
      />
    );
  }

  if (screen === 'shopHub') {
    return (
      <AgentShell active="shop" onChange={changeMainTab}>
        <ShopHubScreen product={selectedProduct} onAnalyze={() => setScreen('discover')} />
      </AgentShell>
    );
  }

  if (screen === 'tutorialHub') {
    return (
      <AgentShell active="tutorial" onChange={changeMainTab}>
        <TutorialHubScreen
          product={selectedProduct}
          archives={archives}
          onOpenArchive={(archiveId) => void openArchiveDetail(archiveId)}
          onShop={() => changeMainTab('shop')}
        />
      </AgentShell>
    );
  }

  if (screen === 'me') {
    return (
      <AgentShell active="me" onChange={changeMainTab}>
        <MyScreen
          profile={profile}
          archives={archives}
          onOpenArchive={(archiveId) => void openArchiveDetail(archiveId)}
        />
      </AgentShell>
    );
  }

  if (screen === 'landing') {
    return (
      <LandingScreen
        video={selectedVideo ?? videos[0]}
        loading={videosLoading}
        error={videosError}
        onRetry={() => void loadVideos()}
        onBack={() => setScreen('discover')}
        onStart={startCameraFromLanding}
      />
    );
  }

  if (screen === 'home') {
    return (
      <AgentShell active="analysis" onChange={changeMainTab}>
        <ReturnHomeScreen
          draft={draft}
          archives={archives}
          loading={archivesLoading}
          onResumeDraft={resumeDraft}
          onOpenArchive={(archiveId) => void openArchiveDetail(archiveId)}
          onArchives={() => void openArchives()}
          onDiscover={openDiscover}
          onStart={openDiscover}
        />
      </AgentShell>
    );
  }

  if (screen === 'camera' && selectedVideo) {
    return (
      <AgentShell active="analysis" onChange={changeMainTab}>
        <CameraScreen
          target={selectedVideo}
          onBack={() => setScreen('landing')}
          onUsePhoto={handleUsePhoto}
        />
      </AgentShell>
    );
  }

  if (screen === 'profile' && selectedVideo && profile) {
    return (
      <AgentShell active="analysis" onChange={changeMainTab}><ProfileScreen
        key={`${profile.profile_id}-${profile.status}`}
        initialProfile={profile}
        currentPhotoUrl={currentPhotoUrl}
        target={selectedVideo}
        onBack={() => setScreen('camera')}
        onConfirm={handleConfirmProfile}
      /></AgentShell>
    );
  }

  if (screen === 'mirror' && selectedVideo && profile) {
    return (
      <AgentShell active="analysis" onChange={changeMainTab}>
        {colorMatrix ? (
          <HairMirror
            matrix={colorMatrix}
            level={mirrorLevel}
            entryVideoId={selectedVideo.video_id}
            onLevelChange={setMirrorLevel}
            onBack={() => setScreen('profile')}
            // 接受风险 -> 此刻才算方案（并触发那唯一一张存档图的生成）
            onAccept={() => void calculatePlan(profile.profile_id)}
          />
        ) : (
          <div className="grid h-full place-items-center bg-cream px-8 text-center text-sm text-ink-3">
            正在加载底色效果矩阵…
          </div>
        )}
      </AgentShell>
    );
  }

  if (screen === 'calculating') {
    return (
      <AgentShell active="analysis" onChange={changeMainTab}><CalculatingScreen
        currentStage={planStage}
        error={planError}
        onRetry={() => {
          if (profile) void calculatePlan(profile.profile_id);
        }}
        onBack={backFromCalculating}
      /></AgentShell>
    );
  }

  if (screen === 'plan' && plan && selectedVideo) {
    return (
      <AgentShell active="analysis" onChange={changeMainTab}><PlanScreen
        plan={plan}
        selectedRoute={selectedRoute}
        selectedIntensity={selectedIntensity}
        previewProgress={previewProgress}
        previewNotice={previewNotice}
        demoMode={Boolean(profile?.demo_mode)}
        demoLoading={demoLoading}
        demoError={demoError}
        onRouteChange={(route) => {
          setSelectedRoute(route);
          setRecommendation(null);
        }}
        onIntensityChange={(intensity) => {
          setSelectedIntensity(intensity);
          setRecommendation(null);
        }}
        onBack={() => setScreen('mirror')}
        onProducts={openProducts}
        onDemoPreview={handleDemoPreview}
      /></AgentShell>
    );
  }

  if (screen === 'products' && selectedVideo) {
    return (
      <AgentShell active="shop" onChange={changeMainTab}>
        <ProductsScreen
          target={selectedVideo}
          route={selectedRoute}
          budget={budget}
          recommendation={recommendation}
          loading={recommendationLoading}
          error={recommendationError}
          onBudgetChange={setBudget}
          onRecommend={() => void recommendProducts()}
          onBack={() => setScreen(plan ? 'plan' : 'shopHub')}
          onContinue={confirmProduct}
        />
      </AgentShell>
    );
  }

  if (
    screen === 'operationPreview' &&
    selectedProduct &&
    selectedVideo
  ) {
    return (
      <AgentShell active="shop" onChange={changeMainTab}>
        <OperationPreviewScreen
          product={selectedProduct}
          target={selectedVideo}
          onBack={() => setScreen('products')}
          onChangeProduct={() => setScreen('products')}
          onSave={() => setScreen('archiveConfirm')}
        />
      </AgentShell>
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
      <AgentShell active="shop" onChange={changeMainTab}><ArchiveConfirmScreen
        profile={profile}
        plan={plan}
        product={selectedProduct}
        purchaseStatus={purchaseStatus}
        currentPhotoUrl={currentPhotoUrl}
        target={selectedVideo}
        saving={archiveSaving}
        error={archiveSaveError}
        onBack={() => setScreen('operationPreview')}
        onSave={() => void saveArchive()}
      /></AgentShell>
    );
  }

  if (screen === 'archiveSaved') {
    return (
      <AgentShell active="shop" onChange={changeMainTab}><ArchiveSavedScreen
        targetName={profile?.target_color.display_name ?? '染发方案'}
        onArchives={() => void openArchives()}
        onBackToVideos={openHome}
      /></AgentShell>
    );
  }

  if (screen === 'archives') {
    return (
      <AgentShell active="me" onChange={changeMainTab}><ArchivesScreen
        archives={archives}
        loading={archivesLoading}
        error={archivesError}
        onBack={() => setScreen('home')}
        onRetry={() => void openArchives()}
        onSelect={(archiveId) => void openArchiveDetail(archiveId)}
        onNew={openHome}
      /></AgentShell>
    );
  }

  if (screen === 'archiveDetail') {
    return (
      <AgentShell active="tutorial" onChange={changeMainTab}><ArchiveDetailScreen
        archive={archiveDetail}
        loading={archiveDetailLoading}
        error={archiveDetailError}
        starting={tutorialStarting}
        tutorialError={tutorialError}
        onBack={() => void openArchives()}
        onRetry={() => {
          if (selectedArchiveId) {
            void openArchiveDetail(selectedArchiveId);
          } else if (savedArchiveId) {
            void openArchiveDetail(savedArchiveId);
          }
        }}
        onStartTutorial={() => {
          if (archiveDetail?.completion_record) {
            setCompletionRecord(archiveDetail.completion_record);
            setCompletionSaved(true);
            setScreen('completion');
            return;
          }
          void startTutorial();
        }}
      /></AgentShell>
    );
  }

  if (screen === 'tutorial' && tutorialSession) {
    return (
      <AgentShell active="tutorial" onChange={changeMainTab}><TutorialScreen
        session={tutorialSession}
        offline={offline}
        onBack={() => {
          const confirmed = window.confirm('退出教程吗？当前步骤会保留在档案中。');
          if (confirmed) {
            setScreen('archiveDetail');
          }
        }}
        onSend={sendTutorialMessage}
        onSessionStep={updateTutorialStep}
        onComplete={completeTutorial}
      /></AgentShell>
    );
  }

  if (screen === 'completion' && archiveDetail && completionRecord) {
    return (
      <AgentShell active="tutorial" onChange={changeMainTab}><CompletionScreen
        archive={archiveDetail}
        record={completionRecord}
        saved={completionSaved}
        onSave={() => void saveCompletion()}
        onArchives={() => void openArchives()}
        onTransitionVideo={() => setScreen('afterPhoto')}
      /></AgentShell>
    );
  }

  if (screen === 'afterPhoto') {
    return (
      <AgentShell active="tutorial" onChange={changeMainTab}><AfterPhotoScreen
        onBack={() => setScreen('completion')}
        onUse={async (file) => submitAfterPhotoFlow(file)}
      /></AgentShell>
    );
  }

  if (screen === 'afterVideo' && afterVideoTask) {
    return (
      <AgentShell active="tutorial" onChange={changeMainTab}><AfterVideoScreen
        task={afterVideoTask}
        onBack={() => setScreen('completion')}
        onRetry={() => {
          afterPollRef.current += 1;
          setAfterVideoTask(null);
          setScreen('afterPhoto');
        }}
      /></AgentShell>
    );
  }

  return (
    <AgentShell active="analysis" onChange={changeMainTab}><ReturnHomeScreen
      draft={draft}
      archives={archives}
      loading={archivesLoading}
      onResumeDraft={resumeDraft}
      onOpenArchive={(archiveId) => void openArchiveDetail(archiveId)}
      onArchives={() => void openArchives()}
      onDiscover={openDiscover}
      onStart={() => setScreen('discover')}
    /></AgentShell>
  );
}
