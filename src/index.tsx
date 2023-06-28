import React, {
  useState,
  useImperativeHandle,
  useCallback,
  useRef,
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

type PageProps = {
  index: number;
  focusAnim: Animated.DerivedValue<number>;
  isActive: boolean;
  pageWidthAnim: Animated.SharedValue<number>;
  pageHeightAnim: Animated.SharedValue<number>;
  pageAnim: Animated.SharedValue<number>;
};
type PageComponentType = (props: PageProps) => JSX.Element | null;

type AnyStyle = StyleProp<ViewStyle> | ReturnType<typeof useAnimatedStyle>;

type Props = {
  vertical?: boolean;
  PageComponent?:
    | PageComponentType
    | React.MemoExoticComponent<PageComponentType>;
  renderPage?: PageComponentType;
  pageCallbackNode?: Animated.SharedValue<number>;
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
};

type ImperativeApiOptions = {
  animated?: boolean;
};

export type InfinitePagerImperativeApi = {
  setPage: (index: number, options: ImperativeApiOptions) => void;
  incrementPage: (options: ImperativeApiOptions) => void;
  decrementPage: (options: ImperativeApiOptions) => void;
};

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
    simultaneousGestures = [],
    gesturesDisabled,
    animationConfig = {},
    renderPage,
    flingVelocity = 500,
    preset = Preset.SLIDE,
    pageInterpolator = PageInterpolators[preset],
    bouncePct = 0.15,
  }: Props,
  ref: React.ForwardedRef<InfinitePagerImperativeApi>
) {
  const pageWidth = useSharedValue(0);
  const pageHeight = useSharedValue(0);
  const pageSize = vertical ? pageHeight : pageWidth;

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const translate = vertical ? translateY : translateX;

  const [curIndex, setCurIndex] = useState(0);
  const pageAnimInternal = useSharedValue(0);
  const pageAnim = pageCallbackNode || pageAnimInternal;

  const pageInterpolatorRef = useRef(pageInterpolator);
  pageInterpolatorRef.current = pageInterpolator;

  const curIndexRef = useRef(curIndex);
  curIndexRef.current = curIndex;

  const animCfgRef = useRef(animationConfig);
  animCfgRef.current = animationConfig;

  const setPage = useCallback(
    (index: number, options: ImperativeApiOptions = {}) => {
      const updatedTranslate = index * pageSize.value * -1;
      if (options.animated) {
        const animCfg = {
          ...DEFAULT_ANIMATION_CONFIG,
          ...animCfgRef.current,
        };

        translate.value = withSpring(updatedTranslate, animCfg);
      } else {
        translate.value = updatedTranslate;
      }
    },
    [pageSize, translate]
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

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      startTranslate.value = translate.value;
    })
    .onUpdate((evt) => {
      const evtTranslate = vertical ? evt.translationY : evt.translationX;

      const rawVal = startTranslate.value + evtTranslate;
      const page = -rawVal / pageSize.value;
      if (page >= minIndex && page <= maxIndex) {
        translate.value = rawVal;
      } else {
        const pageTrans = rawVal % pageSize.value;
        const bounceTrans = pageTrans * (1 - bouncePct);
        translate.value = rawVal - bounceTrans;
      }
    })
    .onEnd((evt) => {
      const evtVelocity = vertical ? evt.velocityY : evt.velocityX;
      const isFling = Math.abs(evtVelocity) > flingVelocity;
      let velocityModifier = isFling ? pageSize.value / 2 : 0;
      if (evtVelocity < 0) velocityModifier *= -1;
      let page =
        -1 * Math.round((translate.value + velocityModifier) / pageSize.value);
      if (page < minIndex) page = minIndex;
      if (page > maxIndex) page = maxIndex;

      const animCfg = Object.assign(
        {},
        DEFAULT_ANIMATION_CONFIG,
        animCfgRef.current
      );

      translate.value = withSpring(-page * pageSize.value, animCfg);
    })
    .enabled(!gesturesDisabled);

  return (
    <GestureDetector
      gesture={Gesture.Simultaneous(panGesture, ...simultaneousGestures)}
    >
      <Animated.View
        style={style}
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
  );
}

type PageWrapperProps = {
  vertical: boolean;
  pageAnim: Animated.SharedValue<number>;
  index: number;
  pageWidth: Animated.SharedValue<number>;
  pageHeight: Animated.SharedValue<number>;
  PageComponent?: PageComponentType;
  renderPage?: PageComponentType;
  isActive: boolean;
  style?: AnyStyle;
  pageInterpolatorRef: React.MutableRefObject<typeof defaultPageInterpolator>;
  pageBuffer: number;
};

export type PageInterpolatorParams = {
  index: number;
  vertical: boolean;
  focusAnim: Animated.DerivedValue<number>;
  pageAnim: Animated.DerivedValue<number>;
  pageWidth: Animated.SharedValue<number>;
  pageHeight: Animated.SharedValue<number>;
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
      if (!pageSize.value) return 99999;
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
