import config from '../tournament.config.json' with {type:'json'};
import {validateConfig} from './schema.mjs';
export default validateConfig(config);
