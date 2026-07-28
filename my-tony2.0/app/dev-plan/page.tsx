'use client';

// 临时验证页：只为在没有后端时预览「方案结果页」UI，验收后删除。
import { useState } from 'react';
import { PlanScreen } from '../tony/decision-screens';
import type { PlanResultData, RouteType } from '../tony/types';

const mockPlan: PlanResultData = {
  profile_id: 'prof_dev',
  plan_id: 'plan_dev',
  feasibility: 'conditional',
  summary: '当前暖金底叠加蓝紫色，最终可能偏莓红。',
  reachability_score: 78,
  risks: [
    {
      title: '可能偏莓红',
      severity: 'medium',
      reason: '当前暖黄底色与蓝紫色叠加，会影响最终色相。',
      suggestion: '如果不能接受偏色，建议先处理底色或咨询专业人士。',
    },
    {
      title: '建议',
      severity: 'low',
      reason: '如果不能接受偏色，建议先处理底色或咨询专业人士。',
      suggestion: '',
    },
  ],
  preview_status: 'completed',
  preview_images: [
    { preview_level: 1, label: '柔和通透', url: '/video-mock/frames/step-1-2.jpg', enabled: true },
    { preview_level: 2, label: '自然日常', url: '/video-mock/frames/step-2-2.jpg', enabled: true },
    { preview_level: 3, label: '推荐效果', url: '/video-mock/frames/step-3-2.jpg', enabled: true },
    { preview_level: 4, label: '明显上色', url: '/video-mock/frames/step-4-1.jpg', enabled: true },
    { preview_level: 5, label: '鲜明显色', url: '/video-mock/frames/step-6-3.jpg', enabled: true },
  ],
  preview_labels: { '1': '柔和通透', '2': '自然日常', '3': '推荐效果', '4': '明显上色', '5': '鲜明显色' },
  route_cards: [
    { route: 'dye', title: '染发', recommended: true, reason: '变化更明显，在当前底色上更接近目标色。' },
    { route: 'color_deposit', title: '固色', recommended: false, reason: '变化更温和，更适合维持或加深现有颜色。' },
  ],
  default_route: 'dye',
  default_preview_level: 3,
  can_recommend_product: true,
};

export default function DevPlanPage() {
  const [route, setRoute] = useState<RouteType>('dye');
  const [intensity, setIntensity] = useState(3);
  return (
    <PlanScreen
      plan={mockPlan}
      selectedRoute={route}
      selectedIntensity={intensity}
      previewProgress={100}
      previewNotice=""
      onRouteChange={setRoute}
      onIntensityChange={setIntensity}
      onBack={() => {}}
      onProducts={() => {}}
    />
  );
}
