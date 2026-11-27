# Adds the `customer`, `partner` and `captain` flavors to the iOS project, matching Android's (pubspec.yaml sets
# default-flavor: customer, so `flutter run` on iOS looks for a `customer` scheme).
# Creates build configurations Debug/Release/Profile-<flavor> and one shared scheme per flavor.
# Run once from apps/mobile with CocoaPods' Ruby (it ships the xcodeproj gem); it is safe to re-run:
#   GEM_HOME=$(brew --prefix cocoapods)/libexec $(brew --prefix ruby)/bin/ruby tool/ios_flavors.rb
require 'xcodeproj'

FLAVORS = {
  'customer' => { bundle: 'com.quikfly.app', name: 'QuikFly', icon: 'AppIcon' },
  'partner' => { bundle: 'com.quikfly.partner', name: 'QuikFly Partner', icon: 'AppIcon-partner' },
  # Captain has its own Info.plist: location reasons and background location, which the other two apps must not declare.
  'captain' => { bundle: 'com.quikfly.captain', name: 'QuikFly Captain', icon: 'AppIcon-captain', plist: 'Runner/Info-captain.plist' },
}.freeze
BASES = %w[Debug Release Profile].freeze

project_path = 'ios/Runner.xcodeproj'
project = Xcodeproj::Project.open(project_path)
runner = project.targets.find { |t| t.name == 'Runner' }

def copy_config(list, base_name, new_name, type)
  base = list.build_configurations.find { |c| c.name == base_name }
  config = list.build_configurations.find { |c| c.name == new_name }
  unless config
    config = list.project.new(Xcodeproj::Project::Object::XCBuildConfiguration)
    config.name = new_name
    list.build_configurations << config
  end
  config.build_settings = Marshal.load(Marshal.dump(base.build_settings))
  config.base_configuration_reference = base.base_configuration_reference
  config
end

FLAVORS.each do |flavor, info|
  BASES.each do |base|
    name = "#{base}-#{flavor}"
    type = base == 'Debug' ? :debug : :release
    copy_config(project.build_configuration_list, base, name, type)
    project.targets.each do |target|
      config = copy_config(target.build_configuration_list, base, name, type)
      next unless target == runner

      config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = info[:bundle]
      config.build_settings['APP_DISPLAY_NAME'] = info[:name]
      config.build_settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = info[:icon]
      config.build_settings['INFOPLIST_FILE'] = info[:plist] || 'Runner/Info.plist'
    end
  end
end
project.save

# One shared scheme per flavor, each using its own configurations (Flutter picks the scheme by flavor name).
schemes_dir = File.join(project_path, 'xcshareddata', 'xcschemes')
template = File.read(File.join(schemes_dir, 'Runner.xcscheme'))
FLAVORS.each_key do |flavor|
  scheme = template
           .gsub('buildConfiguration = "Debug"', %(buildConfiguration = "Debug-#{flavor}"))
           .gsub('buildConfiguration = "Release"', %(buildConfiguration = "Release-#{flavor}"))
           .gsub('buildConfiguration = "Profile"', %(buildConfiguration = "Profile-#{flavor}"))
  File.write(File.join(schemes_dir, "#{flavor}.xcscheme"), scheme)
end
puts 'Flavors added: ' + FLAVORS.keys.join(', ')
