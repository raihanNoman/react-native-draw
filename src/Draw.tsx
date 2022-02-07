import React, {
  Dispatch,
  forwardRef,
  SetStateAction,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import {
  PanGestureHandler,
  PanGestureHandlerGestureEvent,
  PanGestureHandlerStateChangeEvent,
  State,
} from 'react-native-gesture-handler';
import { createSVGPath } from './utils';
import { DrawingTool, PathDataType, PathType } from './types';
import {SVGRenderer,} from './components';
import {
  DEFAULT_COLORS,
  DEFAULT_THICKNESS,
  DEFAULT_OPACITY,
  DEFAULT_TOOL,
  DEFAULT_ERASER_SIZE,
  SLIDERS_HEIGHT,
} from './constants';
import type { BrushType } from './components/renderer/BrushPreview';
import { colorButtonSize } from './components/colorPicker/ColorButton';
const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export interface DrawInitialValues {
  color?: string;
  /**
   * @default DEFAULT_THICKNESS
   */
  thickness?: number;
  /**
   * @default DEFAULT_OPACITY
   */
  opacity?: number;
  /**
   * @default []
   */
  paths?: PathType[];
  /**
   * @default DEFAULT_TOOL
   */
  tool?: DrawingTool;
}

export interface HideBottomBrushProperties {
  opacity?: boolean;
  size?: boolean;
}

export interface HideBottom {
  undo?: boolean;
  clear?: boolean;
  colorPicker?: boolean;
  brushProperties?: boolean | HideBottomBrushProperties;
}

export interface SimplifyOptions {
  simplifyPaths?: boolean;
  simplifyCurrentPath?: boolean;
  amount?: number;
  roundPoints?: boolean;
}

export interface DrawProps {
  /**
   * @default DEFAULT_COLORS
   */
  colors?: string[][][];
  initialValues?: DrawInitialValues;
  canvasStyle?: StyleProp<ViewStyle>;
  buttonStyle?: StyleProp<ViewStyle>;
  onPathsChange?: (paths: PathType[]) => any;
  height?: number;
  width?: number;
  brushPreview?: BrushType;
  hideBottom?: boolean | HideBottom;
  simplifyOptions?: SimplifyOptions;
  autoDismissColorPicker?: boolean;
  /**
   * @default DEFAULT_ERASER_SIZE
   */
  eraserSize?: number;
  /**
   * @default false
   */
  combineWithLatestPath?: boolean;
}

export interface DrawRef {
  undo: () => void;
  setColor: Dispatch<SetStateAction<string>>;
  setThickness: (size: number) => void;
  clear: () => void;
  getPaths: () => PathType[];
  addPath: (path: PathType) => void;
  getSvg: () => string;
}
/**
 * @param paths SVG path data
 * @param simplifyOptions Simplification options for the SVG drawing simplification
 * @returns SVG path strings
 */
const generateSVGPath = (
  path: PathDataType,
  simplifyOptions: SimplifyOptions
) =>
  createSVGPath(
    path,
    simplifyOptions.simplifyPaths ? simplifyOptions.amount! : 0,
    simplifyOptions.roundPoints!
  );

/**
 * @param paths SVG data paths
 * @param simplifyOptions Simplification options for the SVG drawing simplification
 * @returns An array of SVG path strings
 */
const generateSVGPaths = (
  paths: PathType[],
  simplifyOptions: SimplifyOptions
) =>
  paths.map((i) => ({
    ...i,
    path: i.path
      ? i.path
      : i.data.reduce(
          (acc: string[], data) => [
            ...acc,
            generateSVGPath(data, simplifyOptions),
          ],
          []
        ),
  }));

const Draw = forwardRef<DrawRef, DrawProps>(
  (
    {
      colors = DEFAULT_COLORS,
      initialValues = {},
      canvasStyle,
 
      onPathsChange,
      height = screenHeight - 80,
      width = screenWidth,

      simplifyOptions = {},

      eraserSize = DEFAULT_ERASER_SIZE,
      combineWithLatestPath = false,
    } = {},
    ref
  ) => {
    simplifyOptions = {
      simplifyPaths: true,
      simplifyCurrentPath: false,
      amount: 15,
      roundPoints: true,
      ...simplifyOptions,
    };

    initialValues = {
      color: colors[0][0][0],
      thickness: DEFAULT_THICKNESS,
      opacity: DEFAULT_OPACITY,
      tool: DEFAULT_TOOL,
      ...initialValues,
      paths: generateSVGPaths(initialValues.paths || [], simplifyOptions),
    };



    const [paths, setPaths] = useState<PathType[]>(initialValues.paths!);
    const [path, setPath] = useState<PathDataType>([]);
    const [color, setColor] = useState(initialValues.color!);
    const [thickness, setThickness] = useState(initialValues.thickness!);
    const [opacity, setOpacity] = useState(initialValues.opacity!);
    const [colorPickerVisible, setColorPickerVisible] = useState(false);
    const [tool, setTool] = useState<DrawingTool>(initialValues.tool!);

    const addPath = (x: number, y: number) => {
      setPath((prev) => [
        ...prev,
        [
          simplifyOptions.roundPoints ? Math.floor(x) : x,
          simplifyOptions.roundPoints ? Math.floor(y) : y,
        ],
      ]);
    };

    const onGestureEvent = ({
      nativeEvent: { x, y },
    }: PanGestureHandlerGestureEvent) => {
      switch (tool) {
        case DrawingTool.Brush:
          addPath(x, y);
          break;
        case DrawingTool.Eraser:
          setPaths((prevPaths) =>
            prevPaths.reduce((acc: PathType[], p) => {
              const filteredDataPaths = p.data.reduce(
                (
                  acc2: { data: PathDataType[]; path: string[] },
                  data,
                  index
                ) => {
                  const closeToPath = data.some(
                    ([x1, y1]) =>
                      Math.abs(x1 - x) < p.thickness + eraserSize &&
                      Math.abs(y1 - y) < p.thickness + eraserSize
                  );

                  // If point close to path, don't include it
                  if (closeToPath) {
                    return acc2;
                  }

                  return {
                    data: [...acc2.data, data],
                    path: [...acc2.path, p.path![index]],
                  };
                },
                { data: [], path: [] }
              );

              if (filteredDataPaths.data.length > 0) {
                return [...acc, { ...p, ...filteredDataPaths }];
              }

              return acc;
            }, [])
          );
          break;
      }
    };



    const handleThicknessOnChange = (t: number) => setThickness(t);
    const handleUndo = () => {
      setPaths((list) =>
        list.reduce((acc: PathType[], p, index) => {
          if (index === list.length - 1) {
            if (p.data.length > 1) {
              return [
                ...acc,
                {
                  ...p,
                  data: p.data.slice(0, -1),
                  path: p.path!.slice(0, -1),
                },
              ];
            }
            return acc;
          }
          return [...acc, p];
        }, [])
      );
    };
    const clear = () => {
      setPaths([]);
      setPath([]);
    };

    const [animVal] = useState(new Animated.Value(0));

    const onHandlerStateChange = ({
      nativeEvent: { state, x, y },
    }: PanGestureHandlerStateChangeEvent) => {
    

      if (!colorPickerVisible && tool === DrawingTool.Brush) {
        if (state === State.BEGAN) {
          addPath(x, y);
        } else if (state === State.END || state === State.CANCELLED) {
          setPaths((prev) => {
            const newSVGPath = generateSVGPath(path, simplifyOptions);

            if (prev.length === 0) {
              return [
                {
                  color,
                  path: [newSVGPath],
                  data: [path],
                  thickness,
                  opacity,
                  combine: combineWithLatestPath,
                },
              ];
            }

            const lastPath = prev[prev.length - 1];

            // Check if the last path has the same properties
            if (
              lastPath.color === color &&
              lastPath.thickness === thickness &&
              lastPath.opacity === opacity
            ) {
              lastPath.path = [...lastPath.path!, newSVGPath];
              lastPath.data = [...lastPath.data, path];

              return [...prev.slice(0, -1), lastPath];
            }

            return [
              ...prev,
              {
                color,
                path: [newSVGPath],
                data: [path],
                thickness,
                opacity,
                combine: combineWithLatestPath,
              },
            ];
          });
          setPath([]);
        }
      }
    };

    const opacityOverlay = animVal.interpolate({
      inputRange: [-SLIDERS_HEIGHT, 0],
      outputRange: [0.5, 0],
      extrapolate: 'clamp',
    });
    const canvasContainerStyles = [
      styles.canvas,
      {
        transform: [{ translateY: animVal }],
        height,
        width,
      },
      canvasStyle,
    ];
    const canvasOverlayStyles = [
      canvasStyle,
      styles.canvasOverlay,
      {
        opacity: opacityOverlay,
      },
    ];
    useEffect(
      () => onPathsChange && onPathsChange(paths),
      [paths, onPathsChange]
    );

    useImperativeHandle(ref, () => ({
      undo: handleUndo,
      clear,
      setColor,
      setThickness: handleThicknessOnChange,
      getPaths: () => paths,
      addPath: (newPath) => {
        setPaths((prev) => [...prev, newPath]);
      },
      getSvg: () => {
        const serializePath = (
          d: string,
          stroke: string,
          strokeWidth: number,
          strokeOpacity: number
        ) =>
          `<path d="${d}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${strokeOpacity}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;

        const separatePaths = (p: PathType) =>
          p.path!.reduce(
            (acc, innerPath) =>
              `${acc}${serializePath(
                innerPath,
                p.color,
                p.thickness,
                p.opacity
              )}`,
            ''
          );

        const combinedPath = (p: PathType) =>
          `${serializePath(
            p.path!.join(' '),
            p.color,
            p.thickness,
            p.opacity
          )}`;

        const serializedPaths = paths.reduce(
          (acc, p) => `${acc}${p.combine ? combinedPath(p) : separatePaths(p)}`,
          ''
        );

        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${serializedPaths}</svg>`;
      },
    }));

    return (
      <>
        <View style={styles.container}>
          <Animated.View style={canvasContainerStyles}>
            <PanGestureHandler
              maxPointers={1}
              minDist={0}
              avgTouches={false}
              onHandlerStateChange={onHandlerStateChange}
              onGestureEvent={onGestureEvent}
              hitSlop={{
                height,
                width,
                top: 0,
                left: 0,
              }}
              shouldCancelWhenOutside
            >
              <View style={{flex: 1}>
                <SVGRenderer
                  currentColor={color}
                  currentOpacity={opacity}
                  currentPath={path}
                  currentThickness={thickness}
                  currentPathTolerance={
                    simplifyOptions.simplifyCurrentPath
                      ? simplifyOptions.amount!
                      : 0
                  }
                  roundPoints={simplifyOptions.roundPoints!}
                  paths={paths}
                  height={height}
                  width={width}
                />
                <Animated.View style={canvasOverlayStyles} />
              </View>
            </PanGestureHandler>
          </Animated.View>
        </View>
      </>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  canvas: {
    elevation: 5,
    backgroundColor: 'white',
    zIndex: 10,
  },
  canvasOverlay: {
    position: 'absolute',
    height: '100%',
    width: '100%',
    backgroundColor: '#000000',
  },
});

export default Draw;
