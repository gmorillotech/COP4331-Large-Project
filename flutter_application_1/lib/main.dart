import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

void main() {
  runApp(const MainApp());
}

class MainApp extends StatelessWidget {
  const MainApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Sound Map Test',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1F6FEB),
          brightness: Brightness.light,
        ),
        useMaterial3: true,
      ),
      home: const MapTestPage(),
    );
  }
}

class MapAnnotation {
  const MapAnnotation({
    required this.id,
    required this.title,
    required this.body,
    required this.position,
    required this.color,
    required this.iconLabel,
  });

  final String id;
  final String title;
  final String body;
  final LatLng position;
  final Color color;
  final String iconLabel;
}

class MapTestPage extends StatefulWidget {
  const MapTestPage({super.key});

  @override
  State<MapTestPage> createState() => _MapTestPageState();
}

class _MapTestPageState extends State<MapTestPage> {
  static const CameraPosition _initialCameraPosition = CameraPosition(
    target: LatLng(28.5383, -81.3792),
    zoom: 12.2,
  );

  static const List<MapAnnotation> _annotations = [
    MapAnnotation(
      id: 'downtown-live-stage',
      title: 'Downtown Live Stage',
      body:
          'Concert crowd is peaking near the main stage. Hearing protection is recommended.',
      position: LatLng(28.5383, -81.3792),
      color: Color(0xFFD9485F),
      iconLabel: 'E',
    ),
    MapAnnotation(
      id: 'lake-eola-loop',
      title: 'Lake Eola Loop',
      body: 'Steady city noise with moderate traffic passing through the east path.',
      position: LatLng(28.5455, -81.3731),
      color: Color(0xFFFF9F1C),
      iconLabel: 'A',
    ),
    MapAnnotation(
      id: 'creative-village',
      title: 'Creative Village',
      body: 'Lower baseline sound levels reported around the residential blocks.',
      position: LatLng(28.5467, -81.3896),
      color: Color(0xFF2A9D8F),
      iconLabel: 'Q',
    ),
    MapAnnotation(
      id: 'campus-courtyard',
      title: 'Campus Courtyard',
      body:
          'Student foot traffic is rising between classes, but the area remains manageable.',
      position: LatLng(28.6024, -81.2001),
      color: Color(0xFF3A86FF),
      iconLabel: 'C',
    ),
  ];

  GoogleMapController? _mapController;
  String? _selectedId = _annotations.first.id;

  Set<Marker> get _markers {
    return _annotations.map((annotation) {
      final isSelected = annotation.id == _selectedId;

      return Marker(
        markerId: MarkerId(annotation.id),
        position: annotation.position,
        onTap: () => _selectAnnotation(annotation.id),
        icon: BitmapDescriptor.defaultMarkerWithHue(
          _markerHueForColor(annotation.color, isSelected),
        ),
      );
    }).toSet();
  }

  MapAnnotation? get _selectedAnnotation {
    for (final annotation in _annotations) {
      if (annotation.id == _selectedId) {
        return annotation;
      }
    }

    return null;
  }

  @override
  void dispose() {
    _mapController?.dispose();
    super.dispose();
  }

  void _selectAnnotation(String id) {
    setState(() {
      _selectedId = id;
    });
  }

  Future<void> _focusAnnotation(MapAnnotation annotation) async {
    _selectAnnotation(annotation.id);
    await _mapController?.animateCamera(
      CameraUpdate.newLatLng(annotation.position),
    );
  }

  @override
  Widget build(BuildContext context) {
    final selectedAnnotation = _selectedAnnotation;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Google Maps Android Test'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Base map overlay test',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 6),
                Text(
                  'Tap a pin or a list item to test marker selection and the app-owned popup card.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
          Expanded(
            child: Stack(
              children: [
                GoogleMap(
                  initialCameraPosition: _initialCameraPosition,
                  markers: _markers,
                  myLocationButtonEnabled: false,
                  mapToolbarEnabled: false,
                  zoomControlsEnabled: false,
                  onMapCreated: (controller) {
                    _mapController = controller;
                  },
                  onTap: (_) {
                    setState(() {
                      _selectedId = null;
                    });
                  },
                ),
                if (selectedAnnotation != null)
                  Align(
                    alignment: Alignment.bottomCenter,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: _PopupCard(annotation: selectedAnnotation),
                    ),
                  ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: SizedBox(
              height: 152,
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                scrollDirection: Axis.horizontal,
                itemCount: _annotations.length,
                separatorBuilder: (_, _) => const SizedBox(width: 12),
                itemBuilder: (context, index) {
                  final annotation = _annotations[index];
                  final isSelected = annotation.id == _selectedId;

                  return SizedBox(
                    width: 260,
                    child: FilledButton.tonal(
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.all(16),
                        backgroundColor: isSelected
                            ? annotation.color.withValues(alpha: 0.18)
                            : const Color(0xFFF4F7FB),
                        side: BorderSide(
                          color: isSelected
                              ? annotation.color
                              : const Color(0xFFD5DEEA),
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20),
                        ),
                      ),
                      onPressed: () => _focusAnnotation(annotation),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          CircleAvatar(
                            backgroundColor: annotation.color,
                            foregroundColor: Colors.white,
                            child: Text(annotation.iconLabel),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.start,
                              children: [
                                Text(
                                  annotation.title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    color: Color(0xFF102A43),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  annotation.body,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Color(0xFF486581),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PopupCard extends StatelessWidget {
  const _PopupCard({required this.annotation});

  final MapAnnotation annotation;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [
          BoxShadow(
            color: Color(0x22000000),
            blurRadius: 24,
            offset: Offset(0, 14),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: annotation.color,
                  foregroundColor: Colors.white,
                  child: Text(annotation.iconLabel),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    annotation.title,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: const Color(0xFF102A43),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              annotation.body,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: const Color(0xFF486581),
              ),
            ),
            const SizedBox(height: 14),
            Text(
              'Lat ${annotation.position.latitude.toStringAsFixed(4)}  Lon ${annotation.position.longitude.toStringAsFixed(4)}',
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                color: const Color(0xFF829AB1),
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

double _markerHueForColor(Color color, bool isSelected) {
  if (color.red > 200 && color.green < 140) {
    return isSelected ? BitmapDescriptor.hueRose : BitmapDescriptor.hueRed;
  }

  if (color.green > 140 && color.blue > 110) {
    return isSelected ? BitmapDescriptor.hueCyan : BitmapDescriptor.hueAzure;
  }

  if (color.green > 120) {
    return isSelected ? BitmapDescriptor.hueGreen : BitmapDescriptor.hueYellow;
  }

  return isSelected ? BitmapDescriptor.hueOrange : BitmapDescriptor.hueViolet;
}
