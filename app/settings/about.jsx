import SettingsInfoPage from '../../components/SettingsInfoPage';

const sections = [
  {
    title: 'Find your path',
    items: [
      {
        icon: 'map-search-outline',
        title: 'Explore trails',
        description:
          'Find new places to walk, hike, and take in the views at your own pace.',
      },
      {
        icon: 'heart-outline',
        title: 'Save what inspires you',
        description:
          'Keep favorite trails close so they are easy to find when adventure calls.',
      },
      {
        icon: 'terrain',
        title: 'Go prepared',
        description:
          'Use trail details as a starting point, then check local conditions and plan for your own experience.',
      },
    ],
  },
  {
    title: 'Our motto',
    items: [
      {
        icon: 'leaf',
        title: 'Leave only footprints',
        description:
          'Respect nature, follow marked paths, and leave every place as beautiful as you found it.',
      },
    ],
  },
];

export default function AboutPage() {
  return (
    <SettingsInfoPage
      title="About Peakly"
      subtitle="Find your path. Leave only footprints."
      icon="information-outline"
      sections={sections}
      footer="PEAKLY • Made for curious minds and open trails."
    />
  );
}
