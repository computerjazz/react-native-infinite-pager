import { Platform } from "react-native";
import {
  Extrapolate,
  interpolate,
  useAnimatedStyle,
} from "react-native-reanimated";
import { PageInterpolatorParams } from ".";

export const defaultPageInterpolator = pageInterpolatorSlide;

export function pageInterpolatorSlide({
  focusAnim,
  pageWidth,
  pageHeight,
  vertical,
}: PageInterpolatorParams): ReturnType<typeof useAnimatedStyle> {
  "worklet";

  const translateX = vertical
    ? 0
    : interpolate(
        focusAnim.value,
        [-1, 0, 1],
        [-pageWidth.value, 0, pageWidth.value]
      );
  const translateY = vertical
    ? interpolate(
        focusAnim.value,
        [-1, 0, 1],
        [-pageHeight.value, 0, pageHeight.value]
      )
    : 0;

  return {
    transform: [{ translateX }, { translateY }],
  };
}

export function pageInterpolatorCube({
  focusAnim,
  pageWidth,
  pageHeight,
  vertical,
}: PageInterpolatorParams) {
  "worklet";

  const size = vertical ? pageHeight.value : pageWidth.value;

  // FIXME: how to calculate this programatically?
  const ratio = Platform.OS === "android" ? 1.23 : 2;
  const perspective = size;

  const angle = Math.atan(perspective / (size / 2));

  const inputVal = interpolate(focusAnim.value, [-1, 1], [1, -1]);
  const inputRange = [-1, 1];

  const translate = interpolate(
    inputVal,
    inputRange,
    [size / ratio, -size / ratio],
    Extrapolate.CLAMP
  );

  const rotate = interpolate(
    inputVal,
    inputRange,
    [angle, -angle],
    Extrapolate.CLAMP
  );

  const translate1 = interpolate(
    inputVal,
    inputRange,
    [size / 2, -size / 2],
    Extrapolate.CLAMP
  );

  const extra = size / ratio / Math.cos(angle / 2) - size / ratio;
  const translate2 = interpolate(
    inputVal,
    inputRange,
    [-extra, extra],
    Extrapolate.CLAMP
  );

  return {
    transform: vertical
      ? [
          { perspective },
          { translateY: translate },
          { rotateX: `${-rotate}rad` },
          { translateY: translate1 },
          { translateY: translate2 },
        ]
      : [
          { perspective },
          { translateX: translate },
          { rotateY: `${rotate}rad` },
          { translateX: translate1 },
          { translateX: translate2 },
        ],
    opacity: interpolate(inputVal, [-2, -1, 0, 1, 2], [0, 0.9, 1, 0.9, 0]),
  };
}

export function pageInterpolatorStack({
  focusAnim,
  pageWidth,
  pageHeight,
  pageBuffer,
  vertical,
}: PageInterpolatorParams) {
  "worklet";

  const translateX = interpolate(
    focusAnim.value,
    [-1, 0, 1],
    vertical ? [10, 0, -10] : [-pageWidth.value * 1.3, 0, -10]
  );

  const translateY = interpolate(
    focusAnim.value,
    [-0.5, 0, 1],
    vertical ? [-pageHeight.value * 1.3, 0, -10] : [10, 0, -10]
  );

  const opacity = interpolate(
    focusAnim.value,
    [-pageBuffer, -pageBuffer + 1, 0, pageBuffer - 1, pageBuffer],
    [0, 1, 1, 1, 1]
  );

  const scale = interpolate(
    focusAnim.value,
    [-pageBuffer, -pageBuffer + 1, 0, pageBuffer - 1, pageBuffer],
    [0.1, 0.9, 0.9, 0.9, 0.1]
  );

  return {
    transform: [{ translateX }, { translateY }, { scale }],
    opacity,
  };
}

export function pageInterpolatorTurnIn({
  focusAnim,
  pageWidth,
  pageHeight,
  vertical,
}: PageInterpolatorParams) {
  "worklet";

  const translateX = interpolate(
    focusAnim.value,
    [-1, 0, 1],
    vertical ? [0, 0, 0] : [-pageWidth.value * 0.4, 0, pageWidth.value * 0.4]
  );

  const translateY = interpolate(
    focusAnim.value,
    [-1, 0, 1],
    vertical ? [-pageHeight.value * 0.5, 0, pageHeight.value * 0.5] : [0, 0, 0]
  );

  const scale = interpolate(focusAnim.value, [-1, 0, 1], [0.4, 0.5, 0.4]);

  const rotateY = interpolate(
    focusAnim.value,
    [-1, 1],
    vertical ? [0, 0] : [75, -75],
    Extrapolate.CLAMP
  );
  const rotateX = interpolate(
    focusAnim.value,
    [-1, 1],
    vertical ? [-75, 75] : [0, 0],
    Extrapolate.CLAMP
  );

  return {
    transform: [
      { perspective: 1000 },
      { translateX },
      { translateY },
      { rotateY: `${rotateY}deg` },
      { rotateX: `${rotateX}deg` },
      { scale },
    ],
  };
}
