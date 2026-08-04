import { Config } from '@remotion/cli/config';

Config.setEntryPoint('./src/index.ts');
Config.setVideoImageFormat('jpeg');
Config.setCodec('h264');
// SNS のプレビュー(ミュート自動再生)でも潰れないよう、少し高めのビットレート。
Config.setCrf(18);
Config.setOverwriteOutput(true);
// 文字の輪郭を安定させる(headless Chrome の既定はデバイススケール1)。
Config.setScale(1);
Config.setChromiumOpenGlRenderer('angle');
