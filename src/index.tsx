import React, {
  useState,
  useImperativeHandle,
  useCallback,
  useRef,
  useContext,
  useMemo,
} from "react";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  useDerivedValue,
  useAnimatedReaction,
  runOnJS,
  WithSpringConfig,
  makeMutable,
  SharedValue,
  DerivedValue,
} from "react-native-reanimated";
import {
  ComposedGesture,
  Gesture,
  GestureDetector,
  GestureType,
} from "react-native-gesture-handler";
import {
  defaultPageInterpolator,
  pageInterpolatorCube,
  pageInterpolatorSlide,
  pageInterpolatorStack,
  pageInterpolatorTurnIn,
} from "./pageInterpolators";

export enum Preset {
  SLIDE = "slide",
  CUBE = "cube",
  STACK = "stack",
  TURN_IN = "turn-in",
}

const PageInterpolators = {
  [Preset.SLIDE]: pageInterpolatorSlide,
  [Preset.CUBE]: pageInterpolatorCube,
  [Preset.STACK]: pageInterpolatorStack,
  [Preset.TURN_IN]: pageInterpolatorTurnIn,
};

export const DEFAULT_ANIMATION_CONFIG: WithSpringConfig = {
  damping: 20,
  mass: 0.2,
  stiffness: 100,
  overshootClamping: false,
  restSpeedThreshold: 0.2,
  restDisplacementThreshold: 0.2,
};

export type InfinitePagerPageProps = {
  index: number;
  focusAnim: DerivedValue<number>;
  isActive: boolean;
  pageWidthAnim: SharedValue<number>;
  pageHeightAnim: SharedValue<number>;
  pageAnim: SharedValue<number>;
};

export type InfinitePagerPageComponent = (
  props: InfinitePagerPageProps
) => JSX.Element | null;

type AnyStyle = StyleProp<ViewStyle> | ReturnType<typeof useAnimatedStyle>;

export type InfinitePagerProps = {
  vertical?: boolean;
  PageComponent?:
    | InfinitePagerPageComponent
    | React.MemoExoticComponent<InfinitePagerPageComponent>;
  renderPage?: InfinitePagerPageComponent;
  pageCallbackNode?: SharedValue<number>;
  onPageChange?: (page: number) => void;
  pageBuffer?: number; // number of pages to render on either side of active page
  style?: AnyStyle;
  pageWrapperStyle?: AnyStyle;
  pageInterpolator?: typeof defaultPageInterpolator;
  minIndex?: number;
  maxIndex?: number;
  simultaneousGestures?: (ComposedGesture | GestureType)[];
  gesturesDisabled?: boolean;
  animationConfig?: Partial<WithSpringConfig>;
  flingVelocity?: number;
  preset?: Preset;
  bouncePct?: number;
  debugTag?: string;
  width?: number;
  height?: number;
  minDistance?: number;
};

type ImperativeApiOptions = {
  animated?: boolean;
};

export type InfinitePagerImperativeApi = {
  setPage: (index: number, options: ImperativeApiOptions) => void;
  incrementPage: (options: ImperativeApiOptions) => void;
  decrementPage: (options: ImperativeApiOptions) => void;
};

const EMPTY_SIMULTANEOUS_GESTURES: NonNullable<
  InfinitePagerProps["simultaneousGestures"]
> = [];
const EMPTY_ANIMATION_CONFIG: NonNullable<
  InfinitePagerProps["animationConfig"]
> = {};

function InfinitePager(
  {
    vertical = false,
    PageComponent,
    pageCallbackNode,
    onPageChange,
    pageBuffer = 1,
    style,
    pageWrapperStyle,
    minIndex = -Infinity,
    maxIndex = Infinity,
    simultaneousGestures = EMPTY_SIMULTANEOUS_GESTURES,
    gesturesDisabled,
    animationConfig = EMPTY_ANIMATION_CONFIG,
    renderPage,
    flingVelocity = 500,
    preset = Preset.SLIDE,
    pageInterpolator = PageInterpolators[preset],
    bouncePct = 0.0,
    debugTag = "",
    width,
    height,
    minDistance,
  }: InfinitePagerProps,
  ref: React.ForwardedRef<InfinitePagerImperativeApi>
) {
  const orientation = vertical ? "vertical" : "horizontal";

  const pageWidth = useSharedValue(width || 0);
  const pageHeight = useSharedValue(height || 0);
  const pageSize = vertical ? pageHeight : pageWidth;

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const translate = vertical ? translateY : translateX;

  const [curIndex, setCurIndex] = useState(0);

  const pageAnimInternal = useSharedValue(0);
  const pageAnim = pageCallbackNode || pageAnimInternal;

  const {
    simultaneousGestures: parentGestures,
    activePagers,
    nestingDepth,
  } = useContext(InfinitePagerContext);

  const pagerId = `${orientation}:${nestingDepth}`;

  const pageInterpolatorRef = useRef(pageInterpolator);
  pageInterpolatorRef.current = pageInterpolator;

  const curIndexRef = useRef(curIndex);
  curIndexRef.current = curIndex;

  const animCfgRef = useRef(animationConfig);
  animCfgRef.current = animationConfig;

  const gesturesDisabledAnim = useDerivedValue(() => {
    return !!gesturesDisabled;
  }, [gesturesDisabled]);

  const setPage = useCallback(
    (index: number, options: ImperativeApiOptions = {}) => {
      const updatedTranslate = index * pageSize.value * -1;

      if (index < minIndex || index > maxIndex) return;

      if (options.animated) {
        const animCfg = {
          ...DEFAULT_ANIMATION_CONFIG,
          ...animCfgRef.current,
        } as WithSpringConfig;

        translate.value = withSpring(updatedTranslate, animCfg);
      } else {
        translate.value = updatedTranslate;
      }
    },
    [pageSize, translate, minIndex, maxIndex]
  );

  useImperativeHandle(
    ref,
    () => ({
      setPage,
      incrementPage: (options?: ImperativeApiOptions) => {
        setPage(curIndexRef.current + 1, options);
      },
      decrementPage: (options?: ImperativeApiOptions) => {
        setPage(curIndexRef.current - 1, options);
      },
    }),
    [setPage]
  );

  const pageIndices = [...Array(pageBuffer * 2 + 1)].map((_, i) => {
    const bufferIndex = i - pageBuffer;
    return curIndex - bufferIndex;
  });

  useDerivedValue(() => {
    if (pageSize.value) {
      pageAnim.value = (translate.value / pageSize.value) * -1;
    }
  }, [pageSize, pageAnim, translate]);

  function onPageChangeInternal(pg: number) {
    onPageChange?.(pg);
    setCurIndex(pg);
  }

  useAnimatedReaction(
    () => {
      return Math.round(pageAnim.value);
    },
    (cur, prev) => {
      if (cur !== prev) {
        runOnJS(onPageChangeInternal)(cur);
      }
    },
    []
  );

  const startTranslate = useSharedValue(0);

  const panGesture = useMemo(() => Gesture.Pan(), []);

  const minIndexAnim = useDerivedValue(() => {
    return minIndex;
  }, [minIndex]);
  const maxIndexAnim = useDerivedValue(() => {
    return maxIndex;
  }, [maxIndex]);

  const isMinIndex = useDerivedValue(() => {
    return curIndex <= minIndex;
  }, [curIndex, minIndex]);
  const isMaxIndex = useDerivedValue(() => {
    return curIndex >= maxIndex;
  }, [curIndex, maxIndex]);

  const isAtEdge = isMinIndex || isMaxIndex;

  const initTouchX = useSharedValue(0);
  const initTouchY = useSharedValue(0);

  const isGestureLocked = useDerivedValue(() => {
    // Gesture goes to the most-nested active child of both orientations
    // All other pagers are locked
    const isDeepestInOrientation = activePagers.value
      .filter((v) => {
        return v.split(":")[0] === orientation;
      })
      .every((v) => {
        return Number(v.split(":")[1]) <= nestingDepth;
      });
    return activePagers.value.length && !isDeepestInOrientation;
  }, [activePagers, orientation]);

  panGesture
    .onBegin((evt) => {
      "worklet";
      if (!isAtEdge) {
        const updated = activePagers.value.slice();
        updated.push(pagerId);
        activePagers.value = updated;
      }
      startTranslate.value = translate.value;
      initTouchX.value = evt.x;
      initTouchY.value = evt.y;
      if (debugTag) {
        console.log(`${debugTag} onBegin`, evt);
      }
    })
    .onTouchesMove((evt, mgr) => {
      "worklet";
      const mainTouch = evt.changedTouches[0];

      const evtVal = mainTouch[vertical ? "y" : "x"];
      const initTouch = vertical ? initTouchY.value : initTouchX.value;
      const evtTranslate = evtVal - initTouch;

      // const xAxisVal = mainTouch[vertical ? "x" : "y"]
      // const xAxisInitTouch = vertical ? initTouchY.value : initTouchX.value;
      // const xAxisTranslate = xAxisVal - xAxisInitTouch
      // const isSwipingCrossAxis = Math.abs(xAxisTranslate) > 10 && Math.abs(xAxisTranslate) > Math.abs(evtTranslate)

      const swipingPastEnd =
        (isMinIndex.value && evtTranslate > 0) ||
        (isMaxIndex.value && evtTranslate < 0);

      const shouldFailSelf =
        (!bouncePct && swipingPastEnd) ||
        isGestureLocked.value ||
        gesturesDisabledAnim.value;

      if (shouldFailSelf) {
        if (debugTag) {
          const failReason = swipingPastEnd ? "range" : "locked";
          const failDetails = swipingPastEnd
            ? `${isMinIndex.value ? "min" : "max"}, ${evtTranslate}`
            : "";
          console.log(`${debugTag}: ${failReason} fail (${failDetails})`, evt);
          const updated = activePagers.value
            .slice()
            .filter((pId) => pId !== pagerId);
          activePagers.value = updated;
        }
        mgr.fail();
      } else {
        if (!activePagers.value.includes(pagerId)) {
          const updated = activePagers.value.slice();
          updated.push(pagerId);
          activePagers.value = updated;
        }
      }
    })
    .onUpdate((evt) => {
      "worklet";
      const evtTranslate = vertical ? evt.translationY : evt.translationX;
      const crossAxisTranslate = vertical ? evt.translationX : evt.translationY;

      const isSwipingCrossAxis =
        Math.abs(crossAxisTranslate) > 10 &&
        Math.abs(crossAxisTranslate) > Math.abs(evtTranslate);

      if (isGestureLocked.value || isSwipingCrossAxis) return;

      if (debugTag) {
        console.log(
          `${debugTag} onUpdate: ${isGestureLocked.value ? "(locked)" : ""}`,
          evt
        );
      }

      const rawVal = startTranslate.value + evtTranslate;
      const page = -rawVal / pageSize.value;
      if (page >= minIndexAnim.value && page <= maxIndexAnim.value) {
        translate.value = rawVal;
      } else {
        const pageTrans = rawVal % pageSize.value;
        const bounceTrans = pageTrans * (1 - bouncePct);
        translate.value = rawVal - bounceTrans;
      }
    })
    .onEnd((evt) => {
      "worklet";
      const evtVelocity = vertical ? evt.velocityY : evt.velocityX;
      const evtTranslate = vertical ? evt.translationY : evt.translationX;
      const crossAxisTranslate = vertical ? evt.translationX : evt.translationY;
      const isSwipingCrossAxis =
        Math.abs(crossAxisTranslate) > Math.abs(evtTranslate);

      const isFling =
        isGestureLocked.value || isSwipingCrossAxis
          ? false
          : Math.abs(evtVelocity) > flingVelocity;
      let velocityModifier = isFling ? pageSize.value / 2 : 0;
      if (evtVelocity < 0) velocityModifier *= -1;
      let page =
        -1 * Math.round((translate.value + velocityModifier) / pageSize.value);
      if (page < minIndexAnim.value) page = minIndexAnim.value;
      if (page > maxIndexAnim.value) page = maxIndexAnim.value;

      const animCfg = Object.assign(
        {},
        DEFAULT_ANIMATION_CONFIG,
        animCfgRef.current
      );
      translate.value = withSpring(-page * pageSize.value, animCfg);
      if (debugTag) {
        console.log(
          `${debugTag}: onEnd (${
            isGestureLocked.value ? "locked" : "unlocked"
          })`,
          evt
        );
      }
    })
    .onFinalize((evt) => {
      "worklet";
      const updatedPagerIds = activePagers.value
        .slice()
        .filter((id) => id !== pagerId);
      activePagers.value = updatedPagerIds;

      if (debugTag) {
        console.log(
          `${debugTag}: onFinalize (${
            isGestureLocked.value ? "locked" : "unlocked"
          })`,
          evt
        );
      }
    })
    .enabled(!gesturesDisabled);

  if (typeof minDistance === "number") {
    panGesture.minDistance(minDistance);
  }

  const allGestures = useMemo(
    () => [panGesture, ...parentGestures, ...simultaneousGestures],
    [panGesture, parentGestures, simultaneousGestures]
  );

  const wrapperStyle = useMemo(() => {
    const s: StyleProp<ViewStyle> = {};
    if (width) s.width = width;
    if (height) s.height = height;
    return s;
  }, [width, height]);

  return (
    <InfinitePagerProvider simultaneousGestures={allGestures}>
      <GestureDetector gesture={Gesture.Simultaneous(...allGestures)}>
        <Animated.View
          style={[wrapperStyle, style]}
          onLayout={({ nativeEvent: { layout } }) => {
            pageWidth.value = layout.width;
            pageHeight.value = layout.height;
          }}
        >
          {pageIndices.map((pageIndex) => {
            return (
              <PageWrapper
                key={`page-provider-wrapper-${pageIndex}`}
                vertical={vertical}
                pageAnim={pageAnim}
                index={pageIndex}
                pageWidth={pageWidth}
                pageHeight={pageHeight}
                isActive={pageIndex === curIndex}
                PageComponent={PageComponent}
                renderPage={renderPage}
                style={pageWrapperStyle}
                pageInterpolatorRef={pageInterpolatorRef}
                pageBuffer={pageBuffer}
              />
            );
          })}
        </Animated.View>
      </GestureDetector>
    </InfinitePagerProvider>
  );
}

type PageWrapperProps = {
  vertical: boolean;
  pageAnim: SharedValue<number>;
  index: number;
  pageWidth: SharedValue<number>;
  pageHeight: SharedValue<number>;
  PageComponent?: InfinitePagerPageComponent;
  renderPage?: InfinitePagerPageComponent;
  isActive: boolean;
  style?: AnyStyle;
  pageInterpolatorRef: React.MutableRefObject<typeof defaultPageInterpolator>;
  pageBuffer: number;
};

export type PageInterpolatorParams = {
  index: number;
  vertical: boolean;
  focusAnim: DerivedValue<number>;
  pageAnim: DerivedValue<number>;
  pageWidth: SharedValue<number>;
  pageHeight: SharedValue<number>;
  pageBuffer: number;
};

const PageWrapper = React.memo(
  ({
    index,
    pageAnim,
    pageWidth,
    pageHeight,
    vertical,
    PageComponent,
    renderPage,
    isActive,
    style,
    pageInterpolatorRef,
    pageBuffer,
  }: PageWrapperProps) => {
    const pageSize = vertical ? pageHeight : pageWidth;

    const translation = useDerivedValue(() => {
      const translateX = (index - pageAnim.value) * pageSize.value;
      return translateX;
    }, []);

    const focusAnim = useDerivedValue(() => {
      if (!pageSize.value) {
        return index;
      }
      return translation.value / pageSize.value;
    }, []);

    const animStyle = useAnimatedStyle(() => {
      // Short circuit page interpolation to prevent buggy initial values due to possible race condition:
      // https://github.com/software-mansion/react-native-reanimated/issues/2571
      const isInactivePageBeforeInit = index !== 0 && !pageSize.value;
      const _pageWidth = isInactivePageBeforeInit ? focusAnim : pageWidth;
      const _pageHeight = isInactivePageBeforeInit ? focusAnim : pageHeight;
      return pageInterpolatorRef.current({
        focusAnim,
        pageAnim,
        pageWidth: _pageWidth,
        pageHeight: _pageHeight,
        index,
        vertical,
        pageBuffer,
      });
    }, [
      pageWidth,
      pageHeight,
      pageAnim,
      index,
      translation,
      vertical,
      pageBuffer,
    ]);

    if (PageComponent && renderPage) {
      console.warn(
        "PageComponent and renderPage both defined, defaulting to PageComponent"
      );
    }

    if (!PageComponent && !renderPage) {
      throw new Error("Either PageComponent or renderPage must be defined.");
    }

    return (
      <Animated.View
        pointerEvents={isActive ? "auto" : "none"}
        style={[
          style,
          styles.pageWrapper,
          animStyle,
          isActive && styles.activePage,
        ]}
      >
        {PageComponent ? (
          <PageComponent
            index={index}
            isActive={isActive}
            focusAnim={focusAnim}
            pageWidthAnim={pageWidth}
            pageHeightAnim={pageHeight}
            pageAnim={pageAnim}
          />
        ) : (
          renderPage?.({
            index,
            isActive,
            focusAnim,
            pageWidthAnim: pageWidth,
            pageHeightAnim: pageHeight,
            pageAnim,
          })
        )}
      </Animated.View>
    );
  }
);

export default React.memo(React.forwardRef(InfinitePager));

const styles = StyleSheet.create({
  pageWrapper: {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    position: "absolute",
  },
  activePage: {
    position: "relative",
  },
});

type SimultaneousGesture = ComposedGesture | GestureType;

const InfinitePagerContext = React.createContext({
  simultaneousGestures: [] as SimultaneousGesture[],
  activePagers: makeMutable([] as string[]),
  nestingDepth: 0,
});

function InfinitePagerProvider({
  simultaneousGestures = [],
  children,
}: {
  registerChildGesture?: (childGesture: SimultaneousGesture) => void;
  simultaneousGestures?: SimultaneousGesture[];
  gestureLock?: SharedValue<boolean>;
  children: React.ReactNode;
}) {
  const { nestingDepth, activePagers } = useContext(InfinitePagerContext);

  const value = useMemo(() => {
    return {
      simultaneousGestures,
      nestingDepth: nestingDepth + 1,
      activePagers,
    };
  }, [simultaneousGestures, nestingDepth, activePagers]);

  return (
    <InfinitePagerContext.Provider value={value}>
      {children}
    </InfinitePagerContext.Provider>
  );
}
