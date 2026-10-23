import {Config} from '@remotion/cli/config';

// Inputs (captures, voice, timeline.json) are generated into build/public by build.mjs.
Config.setPublicDir('build/public');
Config.setVideoImageFormat('png');
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
Config.setCrf(14);
Config.setColorSpace('bt709');
