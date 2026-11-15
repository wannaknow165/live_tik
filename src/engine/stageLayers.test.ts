import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTrackedVfxAnchors,
  getObsLayerVisibility,
  getStudioLayerVisibility,
  shouldRenderAiClientVideoLayer,
  shouldRenderOpponentOverlay,
  STAGE_LAYER_STACK,
} from './stageLayers';

test('STAGE_LAYER_STACK defines exactly 8 distinct layers ordered strictly top-to-bottom', () => {
  assert.equal(STAGE_LAYER_STACK.length, 8);
  assert.deepEqual(
    STAGE_LAYER_STACK.map((l) => l.id),
    [
      'L8_INFO_PROMOTIONS',
      'L7_AI_CLIENT_VIDEO',
      'L6_OPPONENT_OVERLAY',
      'L5_TRACKED_FRONT_FX',
      'L4_STANDARD_FRONT_FX',
      'L3_PRESENTER_CAMERA',
      'L2_BACK_FX',
      'L1_PERMANENT_WALL',
    ]
  );

  for (let i = 1; i < STAGE_LAYER_STACK.length; i++) {
    assert.ok(
      STAGE_LAYER_STACK[i - 1].zIndex > STAGE_LAYER_STACK[i].zIndex,
      `Expected ${STAGE_LAYER_STACK[i - 1].id} zIndex > ${STAGE_LAYER_STACK[i].id} zIndex`
    );
  }
});

test('OBS front layer strictly isolates L4_STANDARD_FRONT_FX from L8_INFO_PROMOTIONS', () => {
  const frontVis = getObsLayerVisibility('front');
  assert.equal(frontVis.L4_STANDARD_FRONT_FX, true);
  assert.equal(frontVis.L8_INFO_PROMOTIONS, false);
  assert.equal(frontVis.L6_OPPONENT_OVERLAY, false);
  assert.equal(frontVis.L7_AI_CLIENT_VIDEO, false);

  const infoVis = getObsLayerVisibility('info');
  assert.equal(infoVis.L8_INFO_PROMOTIONS, true);
  assert.equal(infoVis.L4_STANDARD_FRONT_FX, false);
  assert.equal(infoVis.L2_BACK_FX, false);
});

test('L7 AI Client Video renders ONLY when video status is READY with valid videoUrl', () => {
  assert.equal(shouldRenderAiClientVideoLayer(undefined), false);
  assert.equal(shouldRenderAiClientVideoLayer({ status: 'IDLE', videoUrl: null }), false);
  assert.equal(shouldRenderAiClientVideoLayer({ status: 'GENERATING', videoUrl: '/assets/generated/a.mp4' }), false);
  assert.equal(shouldRenderAiClientVideoLayer({ status: 'FAILED', videoUrl: null }), false);
  assert.equal(shouldRenderAiClientVideoLayer({ status: 'READY', videoUrl: '' }), false);
  assert.equal(
    shouldRenderAiClientVideoLayer({ status: 'READY', videoUrl: '/assets/generated/client_video_1.mp4' }),
    true
  );
});

test('L6 Opponent Overlay renders only in BATTLE mode with a linked opponent username', () => {
  assert.equal(shouldRenderOpponentOverlay({ selectedOpponentUsername: null, streamMode: 'BATTLE' }), false);
  assert.equal(shouldRenderOpponentOverlay({ selectedOpponentUsername: '@rival', streamMode: 'SOLO' }), false);
  assert.equal(shouldRenderOpponentOverlay({ selectedOpponentUsername: '@rival', streamMode: 'BATTLE' }), true);
});

test('computeTrackedVfxAnchors requires genuine face/pose landmarks and rejects unavailable frames', () => {
  const empty = computeTrackedVfxAnchors(
    {
      source: 'UNAVAILABLE',
      hasFace: false,
      hasPose: false,
      confidence: 0,
      updatedAt: Date.now(),
    },
    540,
    960
  );
  assert.equal(empty.active, false);

  const realFrame = computeTrackedVfxAnchors(
    {
      source: 'MEDIAPIPE_LIVE',
      hasFace: true,
      hasPose: true,
      confidence: 0.94,
      updatedAt: Date.now(),
      headCrownNorm: { x: 0.5, y: 0.2 },
      faceCenterNorm: { x: 0.5, y: 0.3 },
      faceRadiusNorm: 0.12,
      leftShoulderNorm: { x: 0.35, y: 0.5 },
      rightShoulderNorm: { x: 0.65, y: 0.5 },
      leftWristNorm: { x: 0.3, y: 0.3 },
    },
    540,
    960
  );
  assert.equal(realFrame.active, true);
  assert.deepEqual(realFrame.headCrownPx, { x: 270, y: 192 });
  assert.equal(realFrame.handsRaised, true);

  const studioBoth = getStudioLayerVisibility('both');
  assert.equal(studioBoth.L3_PRESENTER_CAMERA, true);
  assert.equal(studioBoth.L1_PERMANENT_WALL, true);
});
