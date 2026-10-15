
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Marker } from '@maplibre/maplibre-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { DIFFICULTY_COLORS } from '../constants/trailConfig';

const BOX_W = 64;
const BOX_H = 62;
const PIN = 34;
const PIN_SELECTED = 42;
const HALO_EXTRA = 12;
const TIP_W = 14;
const TIP_H = 10;

const FALLBACK_COLOR = '#2563eb';

function getTrailColor(difficulty) {
  return DIFFICULTY_COLORS?.[difficulty] ?? FALLBACK_COLOR;
}

function TrailBubble({ trail, selected = false }) {
  const color = getTrailColor(trail?.difficulty);
  const size = selected ? PIN_SELECTED : PIN;
  const halo = size + HALO_EXTRA;

  return (
    <View style={styles.wrap} collapsable={false}>
      <View style={styles.stack} collapsable={false}>
        {selected && (
          <View
            pointerEvents="none"
            style={[
              styles.halo,
              {
                width: halo,
                height: halo,
                borderRadius: halo / 2,
                backgroundColor: `${color}33`,
              },
            ]}
          />
        )}

        <View
          style={[
            styles.pin,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: color,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="hiking"
            size={selected ? 24 : 19}
            color="#ffffff"
          />
        </View>
      </View>

      <View
        style={[
          styles.tip,
          { borderTopColor: color },
        ]}
      />
    </View>
  );
}

export default memo(TrailBubble);

export const TrailMarker = memo(function TrailMarker({
  trail,
  selected = false,
  onPress,
}) {
  const latitude = Number(trail?.latitude ?? trail?.lat);
  const longitude = Number(
    trail?.longitude ?? trail?.lng ?? trail?.lon
  );

  const validCoordinates =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;

  if (!validCoordinates) {
    return null;
  }

  return (
    <Marker
      id={`trail-${String(trail.id)}`}
      lngLat={[longitude, latitude]}
      anchor="bottom"
      selected={selected}
      onPress={onPress}
    >
      <TrailBubble trail={trail} selected={selected} />
    </Marker>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: BOX_W,
    alignItems: 'center',
    paddingBottom: 2,
  },
  stack: {
    width: BOX_W,
    height: BOX_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    alignSelf: 'center',
  },
  pin: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#ffffff',
  },
  tip: {
    width: 0,
    height: 0,
    borderLeftWidth: TIP_W / 2,
    borderRightWidth: TIP_W / 2,
    borderTopWidth: TIP_H,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    alignSelf: 'center',
  },
});
