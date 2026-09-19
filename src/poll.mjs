import source from '../poll.config.json' with {type:'json'};
import {createPoll} from './poll-core.mjs';
export const {POLL,blankAnswer,validateAnswer,summarize}=createPoll(source);
