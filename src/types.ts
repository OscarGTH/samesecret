/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MatchTemplate = 'Person' | 'Date' | 'Email' | 'Number' | 'MultipleChoice' | 'Custom';

export interface RoomConfig {
  question: string;
  template: MatchTemplate;
  creatorName: string;
  hashedSecret: string;
  caseSensitive: boolean;
  ignoreWhitespace: boolean;
  selfDestruct: boolean;
}

export interface PersonTemplateConfig {
  includeFirstName: boolean;
  includeLastName: boolean;
  formatHint: string;
}

export interface MultipleChoiceConfig {
  options: string[];
}

export interface RoomState {
  id: string;
  accessCode: string;
  question: string;
  template: MatchTemplate;
  caseSensitive: boolean;
  ignoreWhitespace: boolean;
  selfDestruct: boolean;
  status: string;
  creatorName?: string;
  joinerName?: string;
  creatorG2a?: string;
  creatorG3a?: string;
  templateConfig?: {
    personFields?: {
      includeFirstName: boolean;
      includeLastName: boolean;
      formatHint?: string;
    };
    multipleChoiceOptions?: string;
    multipleChoiceOptionCount?: number;
  };
}