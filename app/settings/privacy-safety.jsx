import SettingsInfoPage from '../../components/SettingsInfoPage';

const sections = [
  {
    title: 'Your privacy',
    items: [
      {
        icon: 'account-lock-outline',
        title: 'Your account',
        description:
          'Your profile helps personalize your Peakly experience. Keep your sign-in details private and use a strong password.',
      },
      {
        icon: 'map-marker-lock-outline',
        title: 'Location awareness',
        description:
          'Location can help you explore nearby trails. You can manage location access in your device settings.',
      },
      {
        icon: 'share-variant-outline',
        title: 'Share thoughtfully',
        description:
          'Think carefully before sharing personal details or a live location with other people.',
      },
    ],
  },
  {
    title: 'On the trail',
    items: [
      {
        icon: 'shield-check-outline',
        title: 'Make a plan',
        description:
          'Tell someone where you are going, check local conditions, and carry the essentials for your route.',
      },
      {
        icon: 'signal-off',
        title: 'Prepare for low signal',
        description:
          'Mobile coverage may be unreliable outdoors. Save important route information and do not rely on the app as an emergency service.',
      },
    ],
  },
];

export default function PrivacySafetyPage() {
  return (
    <SettingsInfoPage
      title="Privacy & Safety"
      subtitle="A few simple ways to protect your information and prepare for the outdoors."
      icon="shield-lock-outline"
      sections={sections}
      footer="Peakly is a trail discovery companion, not a substitute for local guidance or emergency services."
    />
  );
}
