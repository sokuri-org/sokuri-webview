import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

export default function Home() {
  const mountRef = useRef(null);
  const scene = useRef(new THREE.Scene());
  const camera = useRef();
  const renderer = useRef();
  const controls = useRef();
  const bagBox = useRef(null);
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const draggingRef = useRef(null);
  const selectedRef = useRef(null);
  const offset = useRef(new THREE.Vector3());
  const scale = 100;

  function fitCameraToObject(camera, object, offset = 2.5) {
    const boundingBox = new THREE.Box3().setFromObject(object);
    const center = boundingBox.getCenter(new THREE.Vector3());
    const size = boundingBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const distance = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * offset;
    const dir = new THREE.Vector3(1, 1, 1).normalize();
    const newPos = center.clone().add(dir.multiplyScalar(distance));

    camera.position.copy(newPos);
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    if (controls.current) {
      controls.current.target.copy(center);
      controls.current.update();
    }
  }

  useEffect(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.current = new THREE.PerspectiveCamera(
      60,
      width / height,
      0.1,
      20000
    );

    renderer.current = new THREE.WebGLRenderer({ antialias: true });
    renderer.current.setSize(width, height);
    renderer.current.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.current.domElement);

    controls.current = new OrbitControls(camera.current, renderer.current.domElement);
    controls.current.enableDamping = true;
    controls.current.minDistance = 10;
    controls.current.maxDistance = 20000;
    scene.current.background = new THREE.Color("#ffffff");

    scene.current.add(new THREE.AmbientLight(0xffffff, 0.5));
    const light1 = new THREE.DirectionalLight(0xffffff, 0.6);
    light1.position.set(10, 10, 10);
    scene.current.add(light1);

    window.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      function isItemTooBig(item, bag) {
        return (
          item.width > bag.width ||
          item.height > bag.height ||
          item.depth > bag.depth
        );
      }

      if (msg.action === "UPDATE_ITEM_SIZE") {
        const { id, width, height, depth } = msg.data;
        const targetName = `item-${id}`;
        const itemMesh = scene.current.getObjectByName(targetName);
        if (itemMesh) {
          const newGeometry = new THREE.BoxGeometry(width * scale, height * scale, depth * scale);
          itemMesh.geometry.dispose();
          itemMesh.geometry = newGeometry;
          const pos = itemMesh.position;
          itemMesh.position.set(pos.x, (height * scale) / 2, pos.z);
          itemMesh.userData.width = width;
          itemMesh.userData.height = height;
          itemMesh.userData.depth = depth;
        }
      }

      if (msg.action === "ADD_BAG" || msg.action === "RENDER_PACKING") {
        const { bag, items = [] } = msg.data;

        scene.current.clear();

        const geometry = new THREE.BoxGeometry(bag.width * scale, bag.height * scale, bag.depth * scale);
        geometry.translate(0, (bag.height * scale) / 2, 0);

        const bagMesh = new THREE.Mesh(
          geometry,
          new THREE.MeshBasicMaterial({ color: 0x888888, wireframe: true })
        );
        bagMesh.name = "bag";
        bagMesh.position.set(0, 0, 0);
        scene.current.add(bagMesh);
        bagBox.current = new THREE.Box3().setFromObject(bagMesh);

        items.forEach((item) => {
          if (
            typeof item.width === "undefined" ||
            typeof item.height === "undefined" ||
            typeof item.depth === "undefined"
          ) {
            console.warn("Item missing width/height/depth", item);
            return;
          }
          const itemGeometry = new THREE.BoxGeometry(item.width * scale, item.height * scale, item.depth * scale);
          itemGeometry.translate(
            (item.width * scale) / 2,
            (item.height * scale) / 2,
            (item.depth * scale) / 2
          );
          const material = new THREE.MeshStandardMaterial({ color: 0x44ccff });
          const mesh = new THREE.Mesh(itemGeometry, material);
          mesh.name = `item-${item.id}`;
          mesh.position.set(
            item.position.x * scale + (item.width * scale) / 2,
            item.position.y * scale + (item.height * scale) / 2,
            item.position.z * scale + (item.depth * scale) / 2
          );
          scene.current.add(mesh);
        });

        fitCameraToObject(camera.current, bagMesh);

        controls.current.target.copy(new THREE.Vector3(0, (bag.height * scale) / 2, 0));
        controls.current.update();
      }

      if (msg.action === "ADD_ITEM") {
        const { id, width, height, depth, color, x, y, z } = msg.data;

        const bagSize = bagBox.current?.getSize(new THREE.Vector3());
        if (!bagSize) return;

        const halfBag = bagSize.clone().divideScalar(2);
        const hw = (width * scale) / 2;
        const hh = (height * scale) / 2;
        const hd = (depth * scale) / 2;

        let px = x * scale + hw;
        let py = y * scale + hh;
        let pz = z * scale + hd;


        if (
          px - hw < -halfBag.x || px + hw > halfBag.x ||
          py - hh < 0 || py + hh > bagSize.y ||
          pz - hd < -halfBag.z || pz + hd > halfBag.z
        ) {
          window.ReactNativeWebView?.postMessage?.(JSON.stringify({
            type: "ITEM_TOO_LARGE",
            id,
            reason: "아이템이 현재 좌표에서는 가방 안에 들어갈 수 없습니다.",
          }));
          return;
        }

        const geometry = new THREE.BoxGeometry(width * scale, height * scale, depth * scale);
        const material = new THREE.MeshStandardMaterial({ color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `item-${id}`;
        mesh.position.set(px, py, pz);
        scene.current.add(mesh);
      }

      if (msg.action === "REMOVE_ITEM") {
        const { id } = msg.data;
        const name = `item-${String(id)}`;
        const target = scene.current.getObjectByName(name);
        console.log("삭제 시도 중:", name);
        if (target) {
          scene.current.remove(target);
          console.log(`삭제 완료: ${name}`);
        } else {
          console.warn(`삭제 실패: ${name}을 찾을 수 없습니다`);
        }
      }
    });

    const canvas = renderer.current.domElement;

    canvas.addEventListener("pointerdown", (e) => {
      const rect = canvas.getBoundingClientRect();
      pointer.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.current.setFromCamera(pointer.current, camera.current);

      const intersects = raycaster.current.intersectObjects(scene.current.children);
      const target = intersects.find((obj) => obj.object.name.startsWith("item-"));
      if (target) {
        draggingRef.current = target.object;
        selectedRef.current = target.object;

        dragPlane.current.setFromNormalAndCoplanarPoint(
          new THREE.Vector3(0, 1, 0),
          selectedRef.current.position
        );

        const intersection = new THREE.Vector3();
        raycaster.current.ray.intersectPlane(dragPlane.current, intersection);
        offset.current.copy(intersection).sub(selectedRef.current.position);
      }
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!draggingRef.current) return;

      const rect = canvas.getBoundingClientRect();
      pointer.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.current.setFromCamera(pointer.current, camera.current);

      const intersection = new THREE.Vector3();
      raycaster.current.ray.intersectPlane(dragPlane.current, intersection);
      const newPos = intersection.sub(offset.current);
      newPos.y = draggingRef.current.geometry.parameters.height / 2;

      const boxSize = bagBox.current?.getSize(new THREE.Vector3());
      const halfBox = boxSize?.clone().divideScalar(2);
      const itemSize = draggingRef.current.geometry.parameters;

      if (boxSize) {
        const halfItemW = itemSize.width / 2;
        const halfItemD = itemSize.depth / 2;

        newPos.x = Math.max(-halfBox.x + halfItemW, Math.min(halfBox.x - halfItemW, newPos.x));
        newPos.z = Math.max(-halfBox.z + halfItemD, Math.min(halfBox.z - halfItemD, newPos.z));
      }

      draggingRef.current.position.copy(newPos);
      draggingRef.current.material.color.set(0x44ccff);

      window.ReactNativeWebView?.postMessage?.(
        JSON.stringify({
          type: "ITEM_MOVED",
          id: draggingRef.current.name.replace("item-", ""),
          position: {
            x: newPos.x / scale,
            y: newPos.y / scale,
            z: newPos.z / scale,
          },
        })
      );
    });

    canvas.addEventListener("pointerup", () => {
      draggingRef.current = null;
    });

    let lastClickTime = 0;
    let lastClicked = null;
    canvas.addEventListener("click", (e) => {
      const now = Date.now();
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.current.setFromCamera(pointer.current, camera.current);

      const intersects = raycaster.current.intersectObjects(scene.current.children);
      if (intersects.length > 0) {
        const clicked = intersects[0].object;
        if (lastClicked === clicked && now - lastClickTime < 300) {
          if (clicked.name.startsWith("item-")) {
            if (confirm("이 아이템을 삭제하시겠습니까?")) {
              scene.current.remove(clicked);
              window.ReactNativeWebView?.postMessage?.(
                JSON.stringify({ type: "ITEM_DELETED", id: clicked.name.replace("item-", "") })
              );
            }
          }
        }
        lastClickTime = now;
        lastClicked = clicked;
      }
    });

    const animate = () => {
      requestAnimationFrame(animate);
      controls.current.update();
      renderer.current.render(scene.current, camera.current);
    };
    animate();
  }, []);

  return <div ref={mountRef} style={{ width: "100vw", height: "100vh" }} />;
}
