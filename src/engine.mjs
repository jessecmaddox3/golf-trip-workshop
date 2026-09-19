import config from './config.mjs';
import {createEngine} from './engine-core.mjs';
export {createEngine};
export const {getCourseHC,getMatchStrokes,computeMatchResult,tryAutoCalcResults,applyPairings,computeNetBirdies,computeFunStats,computeSandbaggerData,computeBalances,computeSettlements,getPlayerIndex,allocateStrokes,rawCourseHC,scoreValue}=createEngine(config);
