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
  interpolate,
  WithSpringConfig,
} from "react-native-reanimated";
import {
  ComposedGesture,
  Gesture,
  GestureDetector,
  GestureType,
} from "react-native-gesture-handler";

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
  pageAnim: Animated.SharedValue<number>;
};
type PageComponentType = (props: PageProps) => JSX.Element | null;

type AnyStyle = StyleProp<ViewStyle> | ReturnType<typeof useAnimatedStyle>;

type Props = {
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
    PageComponent,
    pageCallbackNode,
    onPageChange,
    pageBuffer = 1,
    style,
    pageWrapperStyle,
    pageInterpolator = defaultPageInterpolator,
    minIndex = -Infinity,
    maxIndex = Infinity,
    simultaneousGestures = [],
    gesturesDisabled,
    animationConfig = {},
    renderPage,
  }: Props,
  ref: React.ForwardedRef<InfinitePagerImperativeApi>
) {
  const pageWidth = useSharedValue(0);
  const translateX = useSharedValue(0);
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
      const updatedTranslateX = index * pageWidth.value * -1;
      if (options.animated) {
        const animCfg = {
          ...DEFAULT_ANIMATION_CONFIG,
          ...animCfgRef.current,
        };

        translateX.value = withSpring(updatedTranslateX, animCfg);
      } else {
        translateX.value = updatedTranslateX;
      }
    },
    [pageWidth, translateX]
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
    if (pageWidth.value) {
      pageAnim.value = (translateX.value / pageWidth.value) * -1;
    }
  }, [pageAnim, translateX]);

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

  const startX = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      startX.value = translateX.value;
    })
    .onUpdate((evt) => {
      const rawVal = startX.value + evt.translationX;
      const page = -rawVal / pageWidth.value;
      if (page >= minIndex && page <= maxIndex) {
        translateX.value = rawVal;
      }
    })
    .onEnd((evt) => {
      const isFling = Math.abs(evt.velocityX) > 500;
      let velocityModifier = isFling ? pageWidth.value / 2 : 0;
      if (evt.velocityX < 0) velocityModifier *= -1;
      let page =
        -1 *
        Math.round((translateX.value + velocityModifier) / pageWidth.value);
      if (page < minIndex) page = minIndex;
      if (page > maxIndex) page = maxIndex;

      const animCfg = Object.assign(
        {},
        DEFAULT_ANIMATION_CONFIG,
        animCfgRef.current
      );

      translateX.value = withSpring(-page * pageWidth.value, animCfg);
    })
    .enabled(!gesturesDisabled);

  return (
    <GestureDetector
      gesture={Gesture.Simultaneous(panGesture, ...simultaneousGestures)}
    >
      <Animated.View
        style={style}
        onLayout={({ nativeEvent }) =>
          (pageWidth.value = nativeEvent.layout.width)
        }
      >
        {pageIndices.map((pageIndex) => {
          return (
            <PageWrapper
              key={`page-provider-wrapper-${pageIndex}`}
              pageAnim={pageAnim}
              index={pageIndex}
              pageWidth={pageWidth}
              isActive={pageIndex === curIndex}
              PageComponent={PageComponent}
              renderPage={renderPage}
              style={pageWrapperStyle}
              pageInterpolatorRef={pageInterpolatorRef}
            />
          );
        })}
      </Animated.View>
    </GestureDetector>
  );
}

type PageWrapperProps = {
  pageAnim: Animated.SharedValue<number>;
  index: number;
  pageWidth: Animated.SharedValue<number>;
  PageComponent?: PageComponentType;
  renderPage?: PageComponentType;
  isActive: boolean;
  style?: AnyStyle;
  pageInterpolatorRef: React.MutableRefObject<typeof defaultPageInterpolator>;
};

export type PageInterpolatorParams = {
  index: number;
  focusAnim: Animated.DerivedValue<number>;
  pageAnim: Animated.DerivedValue<number>;
  pageWidth: Animated.SharedValue<number>;
};

function defaultPageInterpolator({
  focusAnim,
  pageWidth,
}: PageInterpolatorParams): ReturnType<typeof useAnimatedStyle> {
  "worklet";
  return {
    transform: [
      {
        translateX: interpolate(
          focusAnim.value,
          [-1, 0, 1],
          [-pageWidth.value, 0, pageWidth.value]
        ),
      },
    ],
  };
}

const PageWrapper = React.memo(
  ({
    index,
    pageAnim,
    pageWidth,
    PageComponent,
    renderPage,
    isActive,
    style,
    pageInterpolatorRef,
  }: PageWrapperProps) => {
    const translation = useDerivedValue(() => {
      const translateX = (index - pageAnim.value) * pageWidth.value;
      return translateX;
    }, []);

    const focusAnim = useDerivedValue(() => {
      if (!pageWidth.value) return 99999;
      return translation.value / pageWidth.value;
    }, []);

    const animStyle = useAnimatedStyle(() => {
      // Short circuit page interpolation to prevent buggy initial values due to possible race condition:
      // https://github.com/software-mansion/react-native-reanimated/issues/2571
      const isInactivePageBeforeInit = index !== 0 && !pageWidth.value;
      const _pageWidth = isInactivePageBeforeInit ? focusAnim : pageWidth;
      return pageInterpolatorRef.current({
        focusAnim,
        pageAnim,
        pageWidth: _pageWidth,
        index,
      });
    }, [pageWidth, pageAnim, index, translation]);

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
            pageAnim={pageAnim}
          />
        ) : (
          renderPage?.({
            index,
            isActive,
            focusAnim,
            pageWidthAnim: pageWidth,
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
