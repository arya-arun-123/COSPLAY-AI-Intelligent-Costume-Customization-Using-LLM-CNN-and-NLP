import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

const MODEL_PATHS = {
    TSHIRT: '/models/tshirt.glb',
    SHIRT: '/models/shirt.glb',
    HOODIE: '/models/hoodie.glb',
    JEANS: '/models/male_jeans.glb',
};

const modelCache = new Map();

async function loadCachedModel(path) {
    if (!modelCache.has(path)) {
        const loader = new GLTFLoader();

        const promise = loader.loadAsync(path).then(
            (gltf) => gltf.scene
        );

        modelCache.set(path, promise);
    }

    return modelCache.get(path);
}

async function createArtworkTexture(imageUrl) {
    const image = new Image();
    image.src = imageUrl;

    await image.decode();

    const sourceSize = Math.min(
        image.naturalWidth,
        image.naturalHeight
    );

    // Keep the central portion where the garment artwork normally appears.
    const cropSize = sourceSize * 0.62;

    const sourceX =
        (image.naturalWidth - cropSize) / 2;

    const sourceY =
        (image.naturalHeight - cropSize) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;

    const ctx = canvas.getContext('2d', {
        willReadFrequently: true,
    });

    ctx.drawImage(
        image,
        sourceX,
        sourceY,
        cropSize,
        cropSize,
        0,
        0,
        canvas.width,
        canvas.height
    );

    const imageData = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
    );

    const data = imageData.data;

    // Estimate the garment/background color from the corners.
    const samples = [];

    const samplePoints = [
        [8, 8],
        [canvas.width - 9, 8],
        [8, canvas.height - 9],
        [canvas.width - 9, canvas.height - 9],
    ];

    for (const [x, y] of samplePoints) {
        const index =
            (y * canvas.width + x) * 4;

        samples.push([
            data[index],
            data[index + 1],
            data[index + 2],
        ]);
    }

    const background = samples
        .reduce(
            (sum, rgb) => [
                sum[0] + rgb[0],
                sum[1] + rgb[1],
                sum[2] + rgb[2],
            ],
            [0, 0, 0]
        )
        .map((value) => value / samples.length);

    // Make pixels close to the garment/background transparent.
    for (let i = 0; i < data.length; i += 4) {
        const distance = Math.sqrt(
            Math.pow(data[i] - background[0], 2) +
            Math.pow(data[i + 1] - background[1], 2) +
            Math.pow(data[i + 2] - background[2], 2)
        );

        if (distance < 38) {
            data[i + 3] = 0;
        } else if (distance < 70) {
            data[i + 3] = Math.round(
                ((distance - 38) / 32) * 255
            );
        }
    }

    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;

    return texture;
}

function GarmentViewer({
    garmentType,
    designImageUrl = null,
}) {
    const containerRef = useRef(null);
    const modelRef = useRef(null);
    const decalRef = useRef(null);
    const rendererRef = useRef(null);

    const [status, setStatus] = useState(
        'Loading 3D garment...'
    );

    const [error, setError] = useState(null);

    // ---------------------------------------------------------
    // Load the 3D model only when the garment changes.
    // ---------------------------------------------------------
    useEffect(() => {
        const container = containerRef.current;

        if (!container) return;

        const garmentKey = String(
            garmentType || 'TSHIRT'
        ).toUpperCase();

        const modelPath =
            MODEL_PATHS[garmentKey] ||
            MODEL_PATHS.TSHIRT;

        const scene = new THREE.Scene();

        scene.background =
            new THREE.Color(0xf3f3f3);

        const camera =
            new THREE.PerspectiveCamera(
                45,
                1,
                0.01,
                1000
            );

        const renderer =
            new THREE.WebGLRenderer({
                antialias: true,
            });

        renderer.setPixelRatio(
            Math.min(
                window.devicePixelRatio,
                1.5
            )
        );

        renderer.outputColorSpace =
            THREE.SRGBColorSpace;

        rendererRef.current = renderer;

        container.appendChild(
            renderer.domElement
        );

        scene.add(
            new THREE.AmbientLight(
                0xffffff,
                2.5
            )
        );

        const keyLight =
            new THREE.DirectionalLight(
                0xffffff,
                3
            );

        keyLight.position.set(
            5,
            8,
            6
        );

        scene.add(keyLight);

        const fillLight =
            new THREE.DirectionalLight(
                0xffffff,
                1.5
            );

        fillLight.position.set(
            -5,
            4,
            3
        );

        scene.add(fillLight);

        const controls =
            new OrbitControls(
                camera,
                renderer.domElement
            );

        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;
        controls.minDistance = 1;
        controls.maxDistance = 10;

        let model = null;
        let resizeObserver = null;
        let animationFrameId = null;

        setStatus(
            `Loading ${garmentKey}...`
        );

        setError(null);

        loadCachedModel(modelPath)
            .then((sourceModel) => {
                model = sourceModel.clone(true);

                let meshCount = 0;

                model.traverse((child) => {
                    if (!child.isMesh) return;

                    meshCount += 1;

                    child.visible = true;
                    child.castShadow = true;
                    child.receiveShadow = true;
                });

                if (!meshCount) {
                    throw new Error(
                        'The 3D model contains no visible mesh.'
                    );
                }

                scene.add(model);

                modelRef.current = model;

                const originalBox =
                    new THREE.Box3().setFromObject(
                        model
                    );

                const originalCenter =
                    originalBox.getCenter(
                        new THREE.Vector3()
                    );

                const originalSize =
                    originalBox.getSize(
                        new THREE.Vector3()
                    );

                const maxDimension =
                    Math.max(
                        originalSize.x,
                        originalSize.y,
                        originalSize.z
                    );

                model.position.sub(
                    originalCenter
                );

                if (maxDimension > 0) {
                    model.scale.setScalar(
                        3 / maxDimension
                    );
                }

                const fittedBox =
                    new THREE.Box3().setFromObject(
                        model
                    );

                const fittedCenter =
                    fittedBox.getCenter(
                        new THREE.Vector3()
                    );

                const fittedSize =
                    fittedBox.getSize(
                        new THREE.Vector3()
                    );

                const distance =
                    Math.max(
                        fittedSize.y * 1.8,
                        4
                    );

                camera.position.set(
                    fittedCenter.x,
                    fittedCenter.y,
                    fittedCenter.z +
                        distance
                );

                camera.lookAt(
                    fittedCenter
                );

                controls.target.copy(
                    fittedCenter
                );

                controls.update();

                setStatus(
                    `${garmentKey} 3D model loaded.`
                );

                // Store useful geometry information for
                // the design/decal effect.
                model.userData.viewerSize =
                    fittedSize;

                model.userData.viewerCenter =
                    fittedCenter;
            })
            .catch((loadError) => {
                console.error(
                    '3D model load error:',
                    loadError
                );

                setStatus('');

                setError(
                    `Could not load the ${garmentKey.toLowerCase()} 3D model.`
                );
            });

        const resize = () => {
            const width =
                Math.max(
                    container.clientWidth,
                    1
                );

            const height =
                Math.max(
                    container.clientHeight,
                    1
                );

            renderer.setSize(
                width,
                height
            );

            camera.aspect =
                width / height;

            camera.updateProjectionMatrix();
        };

        resize();

        resizeObserver =
            new ResizeObserver(
                resize
            );

        resizeObserver.observe(
            container
        );

        const animate = () => {
            animationFrameId =
                requestAnimationFrame(
                    animate
                );

            controls.update();

            renderer.render(
                scene,
                camera
            );
        };

        animate();

        return () => {
            cancelAnimationFrame(
                animationFrameId
            );

            resizeObserver?.disconnect();

            controls.dispose();

            if (decalRef.current) {
                scene.remove(
                    decalRef.current
                );

                decalRef.current.geometry.dispose();
                decalRef.current.material.map?.dispose();
                decalRef.current.material.dispose();

                decalRef.current = null;
            }

            if (modelRef.current) {
                scene.remove(
                    modelRef.current
                );

                modelRef.current = null;
            }

            renderer.dispose();

            if (
                renderer.domElement.parentNode ===
                container
            ) {
                container.removeChild(
                    renderer.domElement
                );
            }
        };
    }, [garmentType]);

    // ---------------------------------------------------------
    // Apply/change the generated design without reloading GLB.
    // ---------------------------------------------------------
    useEffect(() => {
        const model = modelRef.current;

        if (!model || !designImageUrl) {
            return;
        }

        let cancelled = false;

        const applyDecal = async () => {
            try {
                setStatus(
                    'Applying design to 3D garment...'
                );

                const texture =
                    await createArtworkTexture(
                        designImageUrl
                    );

                if (cancelled) {
                    texture.dispose();
                    return;
                }

                const renderer =
                    rendererRef.current;

                if (!renderer) {
                    texture.dispose();
                    return;
                }

                // Remove old decal.
                if (decalRef.current) {
                    decalRef.current.parent?.remove(
                        decalRef.current
                    );

                    decalRef.current.geometry.dispose();
                    decalRef.current.material.map?.dispose();
                    decalRef.current.material.dispose();

                    decalRef.current = null;
                }

                const meshes = [];

                model.traverse((child) => {
                    if (
                        child.isMesh &&
                        child.visible
                    ) {
                        meshes.push(child);
                    }
                });

                if (!meshes.length) {
                    texture.dispose();

                    setStatus(
                        '3D garment loaded.'
                    );

                    return;
                }

                const size =
                    model.userData.viewerSize;

                const center =
                    model.userData.viewerCenter;

                /*
                 * Aim at the upper-middle/front region
                 * of the garment.
                 */
                const target =
                    center.clone();

                target.y +=
                    size.y * 0.12;

                const direction =
                    target.clone()
                        .sub(
                            new THREE.Vector3(
                                0,
                                target.y,
                                cameraZFallback()
                            )
                        );

                /*
                 * Use a forward ray from the camera
                 * toward the intended design position.
                 */
                const cameraPosition =
                    new THREE.Vector3(
                        0,
                        target.y,
                        Math.max(
                            target.z + 8,
                            8
                        )
                    );

                const rayDirection =
                    target.clone()
                        .sub(
                            cameraPosition
                        )
                        .normalize();

                const raycaster =
                    new THREE.Raycaster(
                        cameraPosition,
                        rayDirection
                    );

                const intersections =
                    raycaster.intersectObjects(
                        meshes,
                        true
                    );

                if (!intersections.length) {
                    texture.dispose();

                    setStatus(
                        '3D garment loaded, but the design surface could not be found.'
                    );

                    return;
                }

                const hit =
                    intersections[0];

                const targetMesh =
                    hit.object;

                const normalMatrix =
                    new THREE.Matrix3()
                        .getNormalMatrix(
                            targetMesh.matrixWorld
                        );

                const worldNormal =
                    hit.face.normal
                        .clone()
                        .applyMatrix3(
                            normalMatrix
                        )
                        .normalize();

                const decalPosition =
                    hit.point
                        .clone()
                        .add(
                            worldNormal
                                .clone()
                                .multiplyScalar(
                                    0.008
                                )
                        );

                const orientation =
                    new THREE.Quaternion()
                        .setFromUnitVectors(
                            new THREE.Vector3(
                                0,
                                0,
                                1
                            ),
                            worldNormal
                        );

                const euler =
                    new THREE.Euler()
                        .setFromQuaternion(
                            orientation
                        );

                const decalWidth =
                    size.x * 0.42;

                const decalHeight =
                    size.y * 0.32;

                const decalDepth =
                    Math.max(
                        size.z * 0.6,
                        0.25
                    );

                const decalGeometry =
                    new DecalGeometry(
                        targetMesh,
                        decalPosition,
                        euler,
                        new THREE.Vector3(
                            decalWidth,
                            decalHeight,
                            decalDepth
                        )
                    );

                const decalMaterial =
                    new THREE.MeshBasicMaterial({
                        map: texture,
                        transparent: true,
                        depthTest: true,
                        depthWrite: false,
                        polygonOffset: true,
                        polygonOffsetFactor: -4,
                        side: THREE.DoubleSide,
                    });

                const decal =
                    new THREE.Mesh(
                        decalGeometry,
                        decalMaterial
                    );

                sceneAddDecal(
                    decal
                );

                decalRef.current =
                    decal;

                renderer.initTexture?.(
                    texture
                );

                setStatus(
                    '3D garment ready. Drag to rotate.'
                );
            } catch (applyError) {
                console.error(
                    '3D decal error:',
                    applyError
                );

                setError(
                    'The 3D garment loaded, but the design could not be positioned.'
                );
            }
        };

        applyDecal();

        return () => {
            cancelled = true;
        };
    }, [designImageUrl]);

    function sceneAddDecal(decal) {
        const model = modelRef.current;

        if (model?.parent) {
            model.parent.add(decal);
        }
    }

    function cameraZFallback() {
        return 8;
    }

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '520px',
                position: 'relative',
                overflow: 'hidden',
                borderRadius: '16px',
                background: '#f3f3f3',
            }}
        >
            {(status || error) && (
                <div
                    style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        right: 12,
                        zIndex: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: error
                            ? 'rgba(255,235,235,0.95)'
                            : 'rgba(255,255,255,0.92)',
                        color: error
                            ? '#9b3333'
                            : '#444',
                        fontSize: 13,
                        pointerEvents: 'none',
                    }}
                >
                    {error || status}
                </div>
            )}
        </div>
    );
}

export default GarmentViewer;
