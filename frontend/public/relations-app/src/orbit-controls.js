// Minimal OrbitControls replacement — enough for our use case.
// Rotate (left drag), pan (right drag / shift-drag), zoom (wheel), damping,
// auto-rotate, target-follow. API compatible subset: .target, .update(),
// .enableDamping, .dampingFactor, .autoRotate, .autoRotateSpeed, .minDistance,
// .maxDistance, .rotateSpeed, .zoomSpeed.

(function () {
  const V3 = THREE.Vector3;
  const Spherical = THREE.Spherical;

  function OrbitControls(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.target = new V3(0, 0, 0);
    this.enableDamping = true;
    this.dampingFactor = 0.08;
    this.rotateSpeed = 0.3;
    this.zoomSpeed = 0.45;
    this.panSpeed = 0.5;
    this.onInteract = null; // ユーザー操作時 (drag/wheel) に呼ばれるコールバック
    this.onPan = null;      // パン (右クリックドラッグ) で target がずれた時のみ呼ばれる
    this.autoRotate = false;
    this.autoRotateSpeed = 0.3;
    this.minDistance = 1;
    this.maxDistance = 500;

    // State
    const sph = new Spherical();
    const sphDelta = new Spherical();
    const panOffset = new V3();
    let scale = 1;

    const start = { x: 0, y: 0 };
    let mode = null; // 'rotate' | 'pan'

    const self = this;

    dom.style.touchAction = 'none';

    function onDown(e) {
      e.preventDefault();
      dom.setPointerCapture(e.pointerId);
      start.x = e.clientX; start.y = e.clientY;
      if (e.button === 2 || e.shiftKey) mode = 'pan';
      else mode = 'rotate';
      if (self.onInteract) self.onInteract();
    }
    function onMove(e) {
      if (!mode) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      start.x = e.clientX; start.y = e.clientY;
      const w = dom.clientWidth, h = dom.clientHeight;
      if (mode === 'rotate') {
        sphDelta.theta -= (2 * Math.PI * dx / w) * self.rotateSpeed;
        sphDelta.phi -= (2 * Math.PI * dy / h) * self.rotateSpeed;
      } else if (mode === 'pan') {
        const offset = self.camera.position.clone().sub(self.target);
        const distance = offset.length();
        const fov = self.camera.fov * Math.PI / 180;
        // 近接時もパンが極端に遅くならないよう下限 25 を保つ
        const worldH = 2 * Math.tan(fov / 2) * Math.max(distance, 25);
        const panX = -(dx / h) * worldH * self.panSpeed;
        const panY = (dy / h) * worldH * self.panSpeed;
        const mx = new V3().setFromMatrixColumn(self.camera.matrix, 0);
        const my = new V3().setFromMatrixColumn(self.camera.matrix, 1);
        panOffset.add(mx.multiplyScalar(panX));
        panOffset.add(my.multiplyScalar(panY));
        if (self.onPan) self.onPan();
      }
    }
    function onUp(e) {
      if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
      mode = null;
    }
    // 目標 radius (target からの距離)。 ホイールで加減し、 update() で sph.radius を lerp。
    // target は動かさないので回転軸が常に明確 (= 直近の選択ノード or 自分)。
    let targetRadius = null;

    function onWheel(e) {
      e.preventDefault();
      const cdx = self.camera.position.x - self.target.x;
      const cdy = self.camera.position.y - self.target.y;
      const cdz = self.camera.position.z - self.target.z;
      const curDist = Math.sqrt(cdx * cdx + cdy * cdy + cdz * cdz);
      const forward = e.deltaY < 0;

      // ハイブリッド: target に近づいて これ以上 軌道で進めない時 (= curDist が
      // minDistance + 余裕 以下) で 前進ホイールなら、 target も一緒に動かす
      // (= 直線前進、 中心通過 OK)。 後退は常に軌道。
      const NEAR_THRESHOLD = self.minDistance + 4;
      if (forward && curDist <= NEAR_THRESHOLD) {
        // カメラから target 方向へ進む = (target - camera) 方向
        const moveDist = 3 * self.zoomSpeed;
        const inv = -moveDist / Math.max(curDist, 0.001); // 符号反転で前方
        self.camera.position.x += cdx * inv;
        self.camera.position.y += cdy * inv;
        self.camera.position.z += cdz * inv;
        self.target.x += cdx * inv;
        self.target.y += cdy * inv;
        self.target.z += cdz * inv;
        targetRadius = null; // sph.radius は次の update で再計算
        if (self.onInteract) self.onInteract();
        return;
      }

      // 通常: 軌道カメラ式 (target 維持、 距離だけ lerp)
      if (targetRadius === null) targetRadius = curDist;
      const baseMove = Math.max(2, Math.min(targetRadius * 0.15 + 3, 40));
      const sign = forward ? -1 : 1;
      targetRadius += sign * baseMove * self.zoomSpeed;
      targetRadius = Math.max(self.minDistance, Math.min(self.maxDistance, targetRadius));
      if (self.onInteract) self.onInteract();
    }
    function onContext(e) { e.preventDefault(); }

    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointercancel', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', onContext);

    this.update = function () {
      const offset = self.camera.position.clone().sub(self.target);
      sph.setFromVector3(offset);

      if (self.autoRotate && mode !== 'rotate') {
        sphDelta.theta -= (2 * Math.PI / 60) * (self.autoRotateSpeed / 60);
      }

      if (self.enableDamping) {
        sph.theta += sphDelta.theta * self.dampingFactor;
        sph.phi += sphDelta.phi * self.dampingFactor;
      } else {
        sph.theta += sphDelta.theta;
        sph.phi += sphDelta.phi;
      }

      sph.phi = Math.max(0.0001, Math.min(Math.PI - 0.0001, sph.phi));
      sph.radius *= scale;
      sph.radius = Math.max(self.minDistance, Math.min(self.maxDistance, sph.radius));

      if (self.enableDamping) {
        self.target.add(panOffset.clone().multiplyScalar(self.dampingFactor));
      } else {
        self.target.add(panOffset);
      }

      // ホイールズーム: sph.radius を targetRadius へ lerp(target は動かさない)
      if (targetRadius !== null) {
        const k = self.enableDamping ? self.dampingFactor * 1.6 : 1;
        sph.radius = sph.radius + (targetRadius - sph.radius) * k;
        if (Math.abs(targetRadius - sph.radius) < 0.05) {
          sph.radius = targetRadius;
          targetRadius = null;
        }
      }

      offset.setFromSpherical(sph);
      self.camera.position.copy(self.target).add(offset);
      self.camera.lookAt(self.target);

      if (self.enableDamping) {
        sphDelta.theta *= (1 - self.dampingFactor);
        sphDelta.phi *= (1 - self.dampingFactor);
        panOffset.multiplyScalar(1 - self.dampingFactor);
      } else {
        sphDelta.set(0, 0, 0); panOffset.set(0, 0, 0);
      }
      scale = 1;
    };

    this.dispose = function () {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onUp);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('contextmenu', onContext);
    };
  }

  THREE.OrbitControls = OrbitControls;
})();
