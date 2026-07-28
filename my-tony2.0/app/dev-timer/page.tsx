'use client';

import { TutorialTimerStage } from '../tony/archive-tutorial-screens';
import type { TutorialStep } from '../tony/types';

const timerStep: TutorialStep = {
  step_id: 'timer-preview',
  step_no: 4,
  total_steps: 5,
  start_time_ms: 0,
  end_time_ms: 9000,
  title: '等待显色',
  description: '染膏需要在头发上停留一段时间。',
  wait_seconds: 15 * 60,
};

export default function DevTimerPage() {
  return (
    <TutorialTimerStage
      step={timerStep}
      onBack={() => {}}
      onContinue={() => {}}
    />
  );
}
