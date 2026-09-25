import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const expo=require('eslint-config-expo/flat');
export default [...expo,{ignores:['dist/**', '.expo/**']}];
