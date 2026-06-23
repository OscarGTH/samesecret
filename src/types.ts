/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MatchTemplate = 'Person' | 'Project' | 'Date' | 'Email' | 'Number' | 'Custom';

export interface RoomConfig {
  question: string;
  template: MatchTemplate;
  creatorName: string;
  hashedSecret: string;
  caseSensitive: boolean;
  ignoreWhitespace: boolean;
  selfDestruct: boolean;
}

export interface RoomState {
  id: string;
  accessCode: string;
  question: string;
  template: MatchTemplate;
  caseSensitive: boolean;
  ignoreWhitespace: boolean;
  selfDestruct: boolean;
  status: 'waiting' | 'joiner_submitted' | 'matched' | 'no_match' | 'cancelled';
  creatorName: string;
  joinerName?: string;
  creatorSmpA?: string;
  joinerSmpB?: string;
  joinerSmpCB?: string;
  creatorSmpCA?: string;
}
