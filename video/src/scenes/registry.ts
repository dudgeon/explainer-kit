import type {ComponentType} from 'react';
import {PaperCard} from './house/PaperCard';

/** What a registered scene draws: the time in the scene, its events (seconds), and the scene's timeline entry. */
export type SceneProps = {t: number; ev: Record<string, number>; scene: {id: string; title: string; topic?: string | null; start?: number; lines?: {text: string; start: number; duration: number}[]}; timeline?: unknown};

/**
 * Scene kinds: a drawn shot whose shots.json entry says `scene: "<kind>"` is drawn by the component listed here.
 * A film's own scenes live in src/scenes/<film>/ (only that film's render keys hash that folder) and are registered
 * here under kinds of their own. Scenes read the film's look with useStyle() from ./house/kit, never from tokens.json.
 */
export const SCENE_KINDS: Record<string, ComponentType<SceneProps>> = {
  // The house title-on-paper scene (src/scenes/house/PaperCard.tsx): the example film is made of it, and any film can
  // use it for a scene before its own drawing exists.
  'paper-card': PaperCard,
};
