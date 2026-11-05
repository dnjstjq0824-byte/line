import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const base = 'mobile/flutter_app/';
test('iOS project source references real app/scene/launch files; this is not an Xcode build certification', () => {
  const project = fs.readFileSync(base + 'ios/Runner.xcodeproj/project.pbxproj', 'utf8');
  for (const file of ['AppDelegate.swift', 'SceneDelegate.swift', 'Runner-Bridging-Header.h', 'Base.lproj/Main.storyboard', 'Base.lproj/LaunchScreen.storyboard']) assert.ok(fs.existsSync(base + 'ios/Runner/' + file), file);
  assert.match(project, /SceneDelegate.swift in Sources/);
  assert.match(fs.readFileSync(base + 'ios/Runner/Info.plist', 'utf8'), /UIApplicationSceneManifest/);
  const icons = JSON.parse(fs.readFileSync(base + 'ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json', 'utf8'));
  const png = fs.readFileSync(base + 'ios/Runner/Assets.xcassets/AppIcon.appiconset/' + icons.images[0].filename);
  assert.equal(png.readUInt32BE(16), 1024); assert.equal(png.readUInt32BE(20), 1024); assert.equal(png[25], 2, 'Store icon has no alpha channel');
});
test('Android launcher files have the density-specific dimensions', () => {
  for (const [density, size] of [['mdpi',48],['hdpi',72],['xhdpi',96],['xxhdpi',144],['xxxhdpi',192]]) {
    const png = fs.readFileSync(base + `android/app/src/main/res/mipmap-${density}/ic_launcher.png`);
    assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
  }
});
